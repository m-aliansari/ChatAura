data "aws_ecr_repository" "server" {
  name = var.project
}

data "aws_secretsmanager_secret" "jwt" {
  name = "${var.project}/jwt-secret"
}

data "aws_secretsmanager_secret" "firebase" {
  name = "${var.project}/firebase-service-account"
}