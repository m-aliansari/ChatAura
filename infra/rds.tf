resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-db-subnets"
  subnet_ids = aws_subnet.public[*].id
  tags       = { Name = "${var.project}-db-subnets" }
}

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_instance" "postgres" {
  identifier     = "${var.project}-postgres"
  engine         = "postgres"
  engine_version = "16"

  instance_class    = "db.t4g.micro"
  allocated_storage = 20

  db_name  = "chataura"
  username = "chataura"
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  publicly_accessible = false

  storage_encrypted = true


  # Should be false in production
  skip_final_snapshot = true

  # Should be true in production
  deletion_protection = false
  tags                = { Name = "${var.project}-postgres" }
}

resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${var.project}/db-password"
  recovery_window_in_days = 0 # allow immediate re-create after destroy
  tags                    = { Name = "${var.project}/db-password" }
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db.result
}
