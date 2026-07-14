resource "aws_ecr_repository" "server" {
  name                 = var.project
  image_tag_mutability = "IMMUTABLE"

  # Both stacks are torn down completely, so `destroy` must be able to remove a
  # repository that still holds images. Set this to false where the registry is
  # long-lived and only the app stack is recycled.
  force_delete = true
}
