// Arduino Analog Read Example
// Reads an analog sensor on A0 and controls LED brightness on pin 9

void setup() {
  pinMode(9, OUTPUT);  // PWM pin for LED
  Serial.begin(9600);
}

void loop() {
  int sensorValue = analogRead(A0);

  // Map sensor reading (0-1023) to PWM value (0-255)
  int brightness = sensorValue / 4;

  analogWrite(9, brightness);

  Serial.print("Sensor: ");
  Serial.println(sensorValue);
}
