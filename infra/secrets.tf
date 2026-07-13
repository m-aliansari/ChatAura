resource "aws_secretsmanager_secret" "jwt" {
  name                    = "${var.project}/jwt-secret"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret" "firebase" {
  name                    = "${var.project}/firebase-service-account"
  recovery_window_in_days = 0
}