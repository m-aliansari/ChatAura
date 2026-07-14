resource "aws_security_group" "alb" {
  name        = "${var.project}-alb"
  description = "Security group for Application Load Balancer"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.project}-alb-sg" }
}

resource "aws_security_group" "tasks" {
  name        = "${var.project}-tasks"
  description = "Security group for tasks"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.project}-task-sg" }
}

resource "aws_security_group" "rds" {
  name        = "${var.project}-rds"
  description = "Security group for PostgreSQL"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.project}-rds-sg" }
}

resource "aws_security_group" "redis" {
  name        = "${var.project}-redis"
  description = "Security group for Elasticache redis"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.project}-redis-sg" }
}

resource "aws_vpc_security_group_ingress_rule" "tasks_from_alb" {
  security_group_id = aws_security_group.tasks.id
  description       = "App port from the ALB"

  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 4000
  to_port                      = 4000
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_tasks" {
  security_group_id = aws_security_group.rds.id
  description       = "PostgreSQL port from App"

  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.tasks.id
}

resource "aws_vpc_security_group_ingress_rule" "redis_from_tasks" {
  security_group_id = aws_security_group.redis.id
  description       = "Redis port from App"

  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
  referenced_security_group_id = aws_security_group.tasks.id
}

resource "aws_vpc_security_group_ingress_rule" "public_http" {
  security_group_id = aws_security_group.alb.id

  cidr_ipv4   = "0.0.0.0/0"
  from_port   = 80
  to_port     = 80
  ip_protocol = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "tasks_all" {
  security_group_id = aws_security_group.tasks.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_vpc_security_group_egress_rule" "alb_all" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
