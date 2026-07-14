terraform {
  required_version = ">= 1.10"

  # State lives in the S3 bucket created by bootstrap/. Values must be literals:
  # the backend is configured before Terraform has a variable system, so var.*
  # is not available here.
  backend "s3" {
    bucket       = "chataura-app-tfstate-001290434504"
    key          = "app/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }

    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}