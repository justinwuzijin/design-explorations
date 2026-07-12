// Arduino Button + LED Example
// Turns on LED when button is pressed

void setup() {
  pinMode(2, INPUT);   // Button input
  pinMode(13, OUTPUT); // LED output
}

void loop() {
  int buttonState = digitalRead(2);

  if (buttonState == HIGH) {
    digitalWrite(13, HIGH);
  } else {
    digitalWrite(13, LOW);
  }
}
