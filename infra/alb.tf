resource "aws_lb" "main" {
  name               = "${var.project}-alb"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  tags = { Name = "${var.project}-alb" }
}

resource "aws_lb_target_group" "server" {
  name        = "${var.project}-lb-tg"
  port        = 4000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  # The WebSocket Upgrade handshake does not exist in HTTP/2 — an h2 target
  # group breaks Socket.io's upgrade silently (it degrades to polling forever).
  protocol_version = "HTTP1"

  health_check {
    path                = "/health"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  # Socket.io's long-polling upgrade spans several requests that must all reach
  # the same process, so clients are pinned to one target. This balances per
  # client rather than per request, and two tasks still cannot deliver to each
  # other's connected users while rooms and presence live in one process's
  # memory — the Socket.io Redis adapter is what lifts that, not stickiness.
  stickiness {
    type    = "lb_cookie"
    enabled = true
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.server.arn
  }
}