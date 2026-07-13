resource "aws_cloudwatch_log_group" "server" {
  name              = "/ecs/${var.project}"
  retention_in_days = 7
}