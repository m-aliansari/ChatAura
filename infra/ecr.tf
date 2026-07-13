resource "aws_ecr_repository" "server" {
  name                 = var.project
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true # exercise stack: let destroy remove a repo that still has images
}