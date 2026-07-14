# infra/ — the AWS stack, as Terraform

Deploys the containerized server to **ECS Fargate behind an ALB, with RDS Postgres, ElastiCache Redis, ECR, Secrets Manager, IAM and CloudWatch Logs**. The client is not deployed here — it stays a static CDN build (Netlify).

The stack is designed to be **ephemeral**: `terraform apply` builds the entire topology from nothing, and `terraform destroy` removes all of it, repeatably. That makes it usable as an on-demand environment rather than a permanent one — but it also means several settings are tuned for clean teardown and should be inverted for a long-lived deployment: `skip_final_snapshot` and `deletion_protection = false` on RDS, `force_delete` on the ECR repository, and `recovery_window_in_days = 0` on the secrets. The listener is plain HTTP, since an ALB's `*.elb.amazonaws.com` hostname cannot carry a certificate; terminating TLS requires a domain you own.

> ⚠️ **This topology costs roughly $0.067/hour and none of it is free-tier.** RDS, ElastiCache and the ALB bill for existing, whether or not anyone uses them. `terraform destroy` when you are finished with the environment.

## Prerequisites

- Terraform ≥ 1.10 (for S3-native state locking), Docker, and the AWS CLI configured with credentials (`aws sts get-caller-identity` should work)
- A Firebase service account JSON, **only if** you want push notifications (see step 3)

## Two stacks, split by lifecycle

**`bootstrap/`** holds the things that must exist _before_ an application can be deployed and that outlive any particular deployment: the **ECR repository** and the two **secret containers**. Apply it once.

**`infra/`** holds everything that is created and destroyed as a unit: VPC, security groups, RDS, ElastiCache, ALB, ECS. It _reads_ the bootstrap resources by name (`data.tf`) rather than owning them.

The split is what makes a single `terraform apply` produce a working stack. Were the registry created by the same apply that runs the service, there would be nowhere to push an image to beforehand — the service would boot, fail to pull, and need a second pass. Separating them also means a destroy/apply cycle never touches your credentials or forces a re-push.

Within `infra/` it is one flat root module. Terraform reads every `.tf` in the directory, so the filenames are the only organization there is:

| File          | What's in it                                                        |
| ------------- | ------------------------------------------------------------------- |
| `network.tf`  | VPC, internet gateway, two public subnets (two AZs), route table    |
| `security.tf` | The four security groups and their rules                            |
| `rds.tf`      | Postgres, its subnet group, the generated password + its secret     |
| `redis.tf`    | ElastiCache replication group and subnet group                      |
| `iam.tf`      | The ECS execution role and the (deliberately empty) task role       |
| `logs.tf`     | CloudWatch log group                                                |
| `alb.tf`      | Load balancer, target group, listener                               |
| `ecs.tf`      | Cluster, server task definition, service, migration task definition |
| `data.tf`     | Lookups of the registry and secrets that `bootstrap/` owns          |

The app stack's state lives in **S3** — versioned (a corrupted write can be rolled back), encrypted at rest, and locked on write via S3 conditional writes (`use_lockfile`; the DynamoDB table that older guides describe is obsolete since Terraform 1.10). `bootstrap/` keeps **local** state permanently and by necessity: a bucket cannot store the state of the stack that creates it.

State matters because **it contains the generated database password in plaintext** — Terraform generated that password, so it cannot hide it from itself. Treat state as a credential. It is also precisely why the JWT and Firebase values are _not_ managed by Terraform (step 3): those it never needs to see.

## Deploy

### 1. Bootstrap — the registry and the secret containers

```bash
cd bootstrap
terraform init
terraform apply
```

Fast, and essentially free. Only needed once per AWS account.

### 2. Build and push the image

```bash
ECR=$(terraform output -raw ecr_repository_url)   # …amazonaws.com/chataura-app
REGISTRY=${ECR%%/*}                               # …amazonaws.com — login takes the registry, not the repo

aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin "$REGISTRY"

cd ../..                                          # repo root
docker build -t "$ECR:v1" .
docker push "$ECR:v1"
```

> On Windows, run the login in **Git Bash or cmd, not PowerShell**. PowerShell 5.1 re-encodes text crossing a native-to-native pipe, which corrupts the token and gets you an opaque `400 Bad Request` from ECR that looks like an auth or permissions problem and is neither. Alternatively install the [ECR credential helper](https://github.com/awslabs/amazon-ecr-credential-helper) and skip `docker login` altogether.

Build from the **repo root**, never from `packages/server` — the server imports `@realtime-chatapp/common` as a workspace, so the build context needs both packages plus the root lockfile.

Tags are **immutable**: ECR will reject a second push to `v1`. Every rebuild needs a new tag (`v2`, or a git SHA), which is what keeps "which build is running?" answerable and rollback possible.

### 3. Put the secret values

Terraform creates the secret _containers_ but not their values — deliberately, so that no credential is written into `terraform.tfstate`. Fill them once, by hand:

```bash
# From the repo root.
aws secretsmanager put-secret-value --secret-id chataura-app/jwt-secret \
  --secret-string "$(openssl rand -base64 32)"

# Base64 the Firebase service account: its private key is multi-line.
aws secretsmanager put-secret-value --secret-id chataura-app/firebase-service-account \
  --secret-string "$(base64 -w0 packages/server/service-account.json)"
```

Both are **plain strings**, not JSON key/value pairs. A wrongly-shaped Firebase value crashes the container at boot; a wrongly-shaped `JWT_SECRET` would fail _silently_, since any string is a valid HMAC key.

Skipping Firebase is fine — set `DISABLE_FCM` to `"true"` in `ecs.tf` and the app stubs push notifications out entirely. With it left at `"false"`, the server requires a valid credential and fails fast at boot without one.

The database password needs nothing: Terraform generates it and writes it to Secrets Manager itself.

### 4. Run the migrations

The schema is built by a **one-off task** — the ECS analogue of a Kubernetes Job, running the same `scripts/migrate.ts` that Compose and the test harnesses use:

```bash
SUBNETS=$(terraform output -json subnet_ids | tr -d '[]" \n')
SG=$(terraform output -raw tasks_security_group_id)

TASK=$(aws ecs run-task \
  --cluster chataura-app \
  --task-definition chataura-app-migration \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG],assignPublicIp=ENABLED}" \
  --query 'tasks[0].taskArn' --output text)

aws ecs wait tasks-stopped --cluster chataura-app --tasks "$TASK"
aws ecs describe-tasks --cluster chataura-app --tasks "$TASK" \
  --query 'tasks[0].containers[0].exitCode'
```

Check it exited `0`, and read its output in CloudWatch under `/ecs/chataura-app`, stream prefix `migration`.

Note the ordering gap: the service is already running by this point, against an empty schema. It stays healthy — `/health` is a liveness check with no database round-trip — but a request that touches the database in this window will fail. Terraform cannot close that gap, because "migrate, then start the application" is a deployment concern rather than a provisioning one. Closing it properly means either applying with `desired_count = 0`, migrating, then scaling up, or running the migration as a pre-deploy step ahead of the rollout.

### 5. Verify

```bash
curl "http://$(terraform output -raw alb_dns_name)/health"
```

Then point the client at the load balancer and use the app for real — two users, two browsers, exchange messages, reload the page. The messages must survive, because they are in RDS:

```bash
# From the repo root.
VITE_API_BASE_URL="http://$(cd infra && terraform output -raw alb_dns_name)" yarn dev:client
```

`CLIENT_BASE_URL` (in `ecs.tf`, via `var.client_base_url`) must match the origin you serve the client from — CORS is strict when `NODE_ENV=production` and will otherwise reject the browser.

Check the transport, too: in DevTools → Network → **WS** there should be a live WebSocket to the load balancer. A stream of `transport=polling` requests that never upgrades means the target group is not speaking HTTP/1.1 — the app still works, which is exactly what makes that failure easy to miss.

## Destroy

**Always the app stack first, then bootstrap.** Terraform orders the teardown correctly _within_ a state file, but it has no idea the two stacks are related — and bootstrap holds the S3 bucket containing the app stack's state. Destroy bootstrap while the app stack is live and you delete the only record of what those resources are: they keep running, and Terraform no longer knows they exist.

```bash
terraform destroy -var image_tag=v1   # in infra/ — the variable is unused here, just required
```

That is normally all you want: it stops the billing, and leaves the registry, the secrets and the state bucket in place so the next `apply` needs no image push and no re-entered credentials.

Tearing down `bootstrap/` as well is a deliberate act, and the state bucket carries `prevent_destroy` to make sure it stays one — `terraform destroy` there will refuse until you remove that `lifecycle` block by hand. The bucket is also versioned, so it must be emptied of _every object version and delete marker_ before S3 will drop it:

```bash
B=$(terraform output -raw state_bucket)

aws s3api delete-objects --bucket "$B" --delete "$(aws s3api list-object-versions \
  --bucket "$B" --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}' --output json)"

aws s3api delete-objects --bucket "$B" --delete "$(aws s3api list-object-versions \
  --bucket "$B" --query '{Objects: DeleteMarkers[].{Key:Key,VersionId:VersionId}}' --output json)"

terraform destroy
```

Terraform tears down in reverse dependency order — the same graph that built the stack, run backwards. Doing this by hand means deleting ~35 resources in the right order, which is easy to leave half-finished and still paying. Afterwards, confirm nothing survives:

```bash
aws ecs list-clusters
aws rds describe-db-instances
aws elasticache describe-replication-groups
```

## Design notes

Decisions here that look wrong until you know why:

- **No NAT Gateway.** Fargate tasks run in _public_ subnets with a public IP so the ECS agent can reach ECR. A NAT would cost ~$32/month to avoid that. The tasks are protected by their security group, not by being in a private subnet — nothing on the internet can open port 4000 on them, because the only permitted source is the ALB's security group.
- **Security groups reference each other by identity, not by CIDR.** Task IPs are ephemeral; group membership is the only stable thing to write a rule against.
- **The target group speaks HTTP/1.1.** The WebSocket `Upgrade` handshake does not exist in HTTP/2 — an h2 target group breaks Socket.io's upgrade silently, degrading it to long-polling forever.
- **The load balancer uses sticky sessions.** Socket.io's upgrade spans several requests that must all reach the same process. This is a **stopgap, not a fix**: it balances per client rather than per request, and two tasks still cannot deliver messages to each other's connected users while rooms and presence live in one process's memory. Removing that constraint is Stage 5's Socket.io Redis adapter — until then, `desired_count` is meaningfully capped at 1.
- **`DATABASE_SSL=true`.** RDS sets `rds.force_ssl=1` by default on Postgres 15+ and rejects unencrypted connections with `no pg_hba.conf entry for host …, no encryption` — which reads like a firewall problem and sends you debugging the wrong layer.
- **The ECS task role has no policies.** The application talks to Postgres and Redis, not to AWS. An empty role says that deliberately; omitting the role would just be silence. The _execution_ role (used by the ECS agent, not your code) can read exactly the three secret ARNs this stack owns — not `*`.
