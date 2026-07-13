variable "region" {
  type        = string
  description = "AWS region for all resources."
  default     = "us-east-1"
}

variable "project" {
  type        = string
  description = "Name prefix and Project tag for all resources."
  default     = "chataura-app"
}