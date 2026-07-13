resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project}-cache-subnets"
  subnet_ids = aws_subnet.public[*].id

  tags = { Name = "${var.project}-cache-subnets" }
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${var.project}-redis"
  description          = "Redis Elasticache"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = "cache.t4g.micro"

  num_cache_clusters         = 1
  port                       = 6379
  security_group_ids         = [aws_security_group.redis.id]
  transit_encryption_enabled = false
  automatic_failover_enabled = false

  subnet_group_name = aws_elasticache_subnet_group.main.name

  tags = { Name = "${var.project}-redis" }

  #TLS and auth are off deliberately because the group is unreachable except from the tasks security group
}
