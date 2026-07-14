output "alb_dns_name" {
  description = "Public hostname of the load balancer — point VITE_API_BASE_URL at this."
  value       = aws_lb.main.dns_name
}

output "rds_endpoint" {
  description = "Postgres hostname (private — reachable only from the tasks security group)."
  value       = aws_db_instance.postgres.address
}

output "redis_endpoint" {
  description = "Redis primary hostname (private)."
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "subnet_ids" {
  description = "Public subnet IDs — needed by `aws ecs run-task` for the migration."
  value       = aws_subnet.public[*].id
}

output "tasks_security_group_id" {
  description = "Security group for Fargate tasks — needed by `aws ecs run-task`."
  value       = aws_security_group.tasks.id
}