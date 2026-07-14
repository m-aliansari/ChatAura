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

variable "image_tag" {
  type        = string
  description = "Tag of the image built by docker"
}

variable "client_base_url" {
  type        = string
  description = "The origin of the client"
  default     = "http://localhost:5173"
}