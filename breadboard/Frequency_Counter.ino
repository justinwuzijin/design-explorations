const int Input_Pin = 2;       // the number of the input pin
long int StartTime;            // initial value returned from from the millis() function when the switch is pressed
long int Duration;             // integer variable to store the duration the switch is depressed (in milliseconds)
float DurationSeconds;         // float variable to store the duration the switch is depressed (in seconds)

byte WGM00_Mask = 0b00000001;  // Mask for WGM00 bit
byte WGM01_Mask = 0b00000010;  // Mask for WGM01 bit
byte WGM02_Mask = 0b00001000;  // Mask for WGM02 bit

byte CS00_Mask = 0b00000001;   // Mask for CS00 bit
byte CS01_Mask = 0b00000010;   // Mask for CS01 bit
byte CS02_Mask = 0b00000100;   // Mask for CS02 bit

void setup()
{
  pinMode(Input_Pin, INPUT);     // Set mode of Input_Pin to INPUT mode
  Serial.begin(9600);            // Set the serial output baudrate to 9,600 bps

  // Set Waveform Generation Mode to Mode 0 by setting WGM00, WGM01, and WGM02 to 0
  TCCR0A = TCCR0A & ~WGM00_Mask;
  TCCR0A = TCCR0A & ~WGM01_Mask;
  TCCR0B = TCCR0B & ~WGM02_Mask;

  // Set Clock Select to Mode 3 for clkIO/64 prescaling by setting CS00 and CS01 to 1 and CS02 to 0
  TCCR0B = TCCR0B | CS00_Mask;
  TCCR0B = TCCR0B | CS01_Mask;
  TCCR0B = TCCR0B & ~CS02_Mask;
}

void loop()
{
  while(digitalRead(Input_Pin) == HIGH);       // wait for the switch to go from HIGH to LOW
  while(digitalRead(Input_Pin) == LOW);        // wait for the switch to go from LOW to HIGH

  StartTime = micros();                        // record start time (in micros)

  while(digitalRead(Input_Pin) == HIGH);        // wait for switch to go from HIGH to LOW
  while(digitalRead(Input_Pin) == LOW);        // wait for the switch to go from LOW to HIGH

  Duration = micros() - StartTime;             // calculate duration the switch is depressed in miliseconds
  float PeriodSeconds = (float)Duration / 1000000.0;
  float Frequency = 1.0/PeriodSeconds;

  Serial.print("Period: ");
  Serial.print(PeriodSeconds);
  Serial.print(" s, Frequency: ");
  Serial.print(Frequency);
  Serial.println(" Hz");
}
