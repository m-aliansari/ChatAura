output "ecr_repository_url" {
  description = "Registry URL to tag and push the server image to."
  value       = aws_ecr_repository.server.repository_url
}

output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}