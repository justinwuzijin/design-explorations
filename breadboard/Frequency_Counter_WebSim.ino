// Frequency Counter - Web Simulator Compatible Version
// Uses millis() instead of micros() for browser compatibility

const int Input_Pin = 2;
long int StartTime;
long int Duration;
float DurationSeconds;
float Frequency;

void setup()
{
  pinMode(Input_Pin, INPUT);
  Serial.begin(9600);
  Serial.println("Frequency Counter Ready");
  Serial.println("Connect signal to pin 2");
}

void loop()
{
  if (digitalRead(Input_Pin) == LOW) {
    while(digitalRead(Input_Pin) == LOW) {
    }

    StartTime = millis();

    while(digitalRead(Input_Pin) == HIGH) {
    }

    while(digitalRead(Input_Pin) == LOW) {
    }

    Duration = millis() - StartTime;
    DurationSeconds = Duration / 1000.0;

    if (DurationSeconds > 0) {
      Frequency = 1.0 / DurationSeconds;

      Serial.print("Period: ");
      Serial.print(DurationSeconds);
      Serial.print(" s, Frequency: ");
      Serial.print(Frequency);
      Serial.println(" Hz");
    }
  }
}
