// Arduino Blink Example
// Blinks an LED connected to pin 13

void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  // In real Arduino, you'd use delay(1000)
  // But in web sim, use millis() instead
  digitalWrite(13, LOW);
}
