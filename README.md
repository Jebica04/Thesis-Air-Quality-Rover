# Thesis-Air-Quality-Rover
This repository contains the source code, cloud architecture configurations, and hardware documentation for an autonomous mobile air quality monitoring rover. Developed as a university engineering thesis project, the platform combines localized environmental sensing, robotic navigation, and real-time cloud data pipelines.

Key features
Autonomous navigation and obstacle avoidance using a panning ultrasonic sensor loop.

Localized air quality tracking for hazardous gases and carbon dioxide levels.

Bi-directional cloud telemetry streaming over persistent WebSocket connections.

Multi-platform data visualization using dedicated web and mobile application dashboards.

Project structure
Firmware: Python scripts running on a Raspberry Pi 5 to control physical locomotion, read sensor inputs through an ADC, and stream metrics.

Backend: Serverless AWS deployment managing WebSocket communication, data parsing microservices, and persistent database storage.

Web application: React and TypeScript dashboard utilizing a virtual DOM for responsive data rendering and spatial maps.

Mobile application: Flutter and Dart app compiled to native machine code for low-latency telemetry tracking.
