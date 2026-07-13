locals {
  container_env = [
    { name = "PORT", value = "4000" },
    { name = "NODE_ENV", value = "production" },
    { name = "CLIENT_BASE_URL", value = var.client_base_url },
    { name = "DATABASE_HOST", value = aws_db_instance.postgres.address },
    { name = "DATABASE_PORT", value = "5432" },
    { name = "DATABASE_NAME", value = aws_db_instance.postgres.db_name },
    { name = "DATABASE_USER", value = aws_db_instance.postgres.username },
    { name = "DATABASE_SSL", value = "true" },
    { name = "REDIS_URL", value = "redis://${aws_elasticache_replication_group.main.primary_endpoint_address}:6379" },
    { name = "DISABLE_FCM", value = "false" },
  ]

  container_secrets = [
    { name = "DATABASE_PASSWORD", valueFrom = aws_secretsmanager_secret.db_password.arn },
    { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret.jwt.arn },
    { name = "FIREBASE_SERVICE_ACCOUNT_JSON", valueFrom = aws_secretsmanager_secret.firebase.arn },
  ]

  log_config = {
    logDriver = "awslogs"
    options = {
      "awslogs-group"  = aws_cloudwatch_log_group.server.name
      "awslogs-region" = var.region
    }
  }
}

resource "aws_ecs_cluster" "main" {
  name = var.project
}

resource "aws_ecs_task_definition" "server" {
  family                   = "${var.project}-server"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = "server"
      image     = "${aws_ecr_repository.server.repository_url}:${var.image_tag}"
      essential = true

      portMappings = [{ containerPort = 4000 }]

      environment = local.container_env
      secrets     = local.container_secrets
      logConfiguration = merge(local.log_config, {
        options = merge(local.log_config.options, { "awslogs-stream-prefix" = "server" })
      })
    }
  ])
}

resource "aws_ecs_service" "server" {
  name            = "${var.project}-server"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.server.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = true # no NAT — this is how the agent reaches ECR
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.server.arn
    container_name   = "server" # must match the name in container_definitions
    container_port   = 4000
  }

  depends_on = [aws_lb_listener.http]
}

resource "aws_ecs_task_definition" "migration" {
  family                   = "${var.project}-migration"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = "migration"
      image     = "${aws_ecr_repository.server.repository_url}:${var.image_tag}"
      essential = true
      command   = ["node", "--import", "tsx", "packages/server/scripts/migrate.ts"]

      environment = local.container_env
      secrets     = local.container_secrets
      logConfiguration = merge(local.log_config, {
        options = merge(local.log_config.options, { "awslogs-stream-prefix" = "migration" })
      })
    }
  ])
}
