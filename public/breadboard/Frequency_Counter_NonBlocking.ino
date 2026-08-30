// Frequency Counter - Non-Blocking Version for Web Simulator
// Uses state machine instead of while loops

const int Input_Pin = 2;
int lastState = LOW;
long int StartTime = 0;
int edgeCount = 0;

void setup()
{
  pinMode(Input_Pin, INPUT);
  Serial.begin(9600);
  Serial.println("=== Frequency Counter Ready ===");
  Serial.println("Press button to measure frequency");
  Serial.println("");
}

void loop()
{
  int currentState = digitalRead(Input_Pin);

  // Detect rising edge (LOW to HIGH transition)
  if (currentState == HIGH && lastState == LOW) {
    edgeCount++;

    if (edgeCount == 1) {
      // First rising edge - start timing
      StartTime = millis();
      Serial.println("Timing started...");
    }
    else if (edgeCount == 2) {
      // Second rising edge - calculate frequency
      long Duration = millis() - StartTime;
      float DurationSeconds = Duration / 1000.0;

      if (DurationSeconds > 0) {
        float Frequency = 1.0 / DurationSeconds;

        Serial.println("------------------------");
        Serial.print("Period: ");
        Serial.print(DurationSeconds);
        Serial.println(" s");
        Serial.print("Frequency: ");
        Serial.print(Frequency);
        Serial.println(" Hz");
        Serial.println("------------------------");
        Serial.println("");
      }

      // Reset for next measurement
      edgeCount = 0;
    }
  }

  lastState = currentState;
}
