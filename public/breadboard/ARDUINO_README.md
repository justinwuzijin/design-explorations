# Arduino Uno Breadboard Simulator

## Overview

This breadboard simulator now includes a **fully functional Arduino Uno** that can run real Arduino sketches and interact with your circuit! The Arduino functions based on the official Arduino Uno specifications:

- **14 digital I/O pins** (D0-D13), with 6 PWM-capable pins (D3, D5, D6, D9, D10, D11)
- **6 analog input pins** (A0-A5) with 10-bit resolution (0-1023)
- **Power pins**: 5V, 3.3V, GND, VIN
- **Real Arduino API**: pinMode(), digitalWrite(), digitalRead(), analogRead(), analogWrite(), millis(), Serial

## How to Use

### 1. Add Arduino to Your Breadboard

1. Open the breadboard simulator at `breadboard/index.html`
2. Find **"Arduino Uno"** in the parts palette (under the "power" category)
3. Drag it onto the canvas next to your breadboard
4. Wire the power pins:
   - Connect **GND** to your circuit's ground (bottom rail -)
   - Connect **5V** or **VIN** to your power supply

### 2. Write Your Sketch

1. Click on the Arduino to select it
2. The inspector panel will show a code editor
3. Write your Arduino C++ sketch with `setup()` and `loop()` functions
4. Click **"upload sketch"** to load your code into the Arduino

### 3. Wire Your Circuit

- **Digital pins**: Connect to LEDs, buttons, switches, or other digital components
- **Analog pins**: Connect to voltage dividers, potentiometers, or sensors
- The Arduino will automatically detect voltages on input pins and drive voltages on output pins

### 4. Run Your Circuit

The Arduino code runs in real-time! You'll see:
- ✅ **Green power LED** lights up when Arduino is powered
- 📡 **TX/RX LEDs** flash when using Serial.print()
- 🔵 **Pin state indicators** show the real-time digital output levels

## Example Sketches

Check out the `examples/` folder for ready-to-use sketches:

### Blink LED (examples/blink.ino)
```cpp
void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  digitalWrite(13, LOW);
}
```

### Button + LED (examples/button_led.ino)
```cpp
void setup() {
  pinMode(2, INPUT);   // Button
  pinMode(13, OUTPUT); // LED
}

void loop() {
  int buttonState = digitalRead(2);
  digitalWrite(13, buttonState);
}
```

### Analog Sensor (examples/analog_read.ino)
```cpp
void setup() {
  pinMode(9, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int sensorValue = analogRead(A0);
  int brightness = sensorValue / 4;  // Map to 0-255
  analogWrite(9, brightness);
  Serial.println(sensorValue);
}
```

### PWM Fade (examples/pwm_fade.ino)
```cpp
int brightness = 0;
int fadeAmount = 5;

void setup() {
  pinMode(9, OUTPUT);
}

void loop() {
  analogWrite(9, brightness);
  brightness = brightness + fadeAmount;
  if (brightness <= 0 || brightness >= 255) {
    fadeAmount = -fadeAmount;
  }
}
```

## Supported Arduino API

### Fully Supported
- ✅ `pinMode(pin, mode)` - Set pin as INPUT, OUTPUT, or INPUT_PULLUP
- ✅ `digitalWrite(pin, value)` - Write HIGH or LOW to digital pin
- ✅ `digitalRead(pin)` - Read digital pin state
- ✅ `analogRead(pin)` - Read analog voltage (0-1023 for 0-5V)
- ✅ `analogWrite(pin, value)` - PWM output (0-255)
- ✅ `millis()` - Milliseconds since Arduino powered on
- ✅ `Serial.begin(baud)` - Initialize serial (logs to console)
- ✅ `Serial.print(msg)` / `Serial.println(msg)` - Print to console

### Not Supported (Web Simulator Limitations)
- ❌ `delay(ms)` - Blocking delays don't work in browser. Use `millis()` for timing instead
- ❌ `delayMicroseconds(us)` - Same issue as delay()
- ❌ `Serial.read()` / `Serial.available()` - No input from browser
- ❌ Interrupts - Use polling instead
- ❌ EEPROM - No persistent storage

## Technical Details

### Pin Specifications

**Digital Pins (D0-D13)**
- Output voltage: 5V (HIGH) or 0V (LOW)
- PWM pins (D3, D5, D6, D9, D10, D11): 8-bit resolution (0-255)
- PWM frequency: ~490 Hz (pins 5-6: ~980 Hz)
- Source/sink current: 20 mA per pin
- Input threshold: 2.5V

**Analog Pins (A0-A5)**
- 10-bit ADC resolution (1024 steps)
- Input range: 0-5V
- Resolution: ~4.88mV per step
- Can also be used as digital pins

**Power Pins**
- 5V: Regulated 5V output (up to 500mA)
- 3.3V: Regulated 3.3V output (up to 50mA)
- GND: Ground reference
- VIN: External power input (7-12V recommended)

### How It Works

The Arduino simulation uses a JavaScript interpreter that:

1. **Parses Arduino C++ code** and extracts setup() and loop() functions
2. **Converts to JavaScript** by mapping Arduino API calls to runtime methods
3. **Executes in real-time** - loop() runs every animation frame (~60 FPS)
4. **Interacts with circuit** - reads voltages from breadboard, drives outputs
5. **Updates display** - shows power status, pin states, serial output

The interpreter supports basic Arduino syntax including variables, if statements, for loops, and most standard operators.

## Tips & Tricks

1. **Power your Arduino first** - Always connect GND and 5V before testing your sketch
2. **Use Serial debugging** - Serial.println() messages appear in browser console
3. **PWM for LED brightness** - Use analogWrite() on PWM pins to control LED intensity
4. **Check pin numbers** - Digital pins are D0-D13, analog are A0-A5
5. **No blocking delays** - Replace delay() with millis()-based timing:
   ```cpp
   unsigned long lastTime = 0;
   void loop() {
     if (millis() - lastTime > 1000) {
       // Do something every second
       lastTime = millis();
     }
   }
   ```

## Known Limitations

- **No delay() support** - Use millis() for timing
- **Simplified parser** - Complex C++ features may not work
- **No libraries** - Only core Arduino functions supported
- **Loop runs at ~60 FPS** - Not the exact Arduino timing

Despite these limitations, most basic to intermediate Arduino projects will work perfectly!

## Example Circuits

### LED Blink
1. Add Arduino to canvas
2. Wire 5V and GND to power rails
3. Connect LED cathode to D13, anode to ground (through resistor)
4. Upload blink.ino sketch

### Analog Sensor
1. Wire potentiometer: one end to 5V, other to GND, wiper to A0
2. Connect LED to pin D9 (PWM capable)
3. Upload analog_read.ino
4. Rotate potentiometer to change LED brightness

### Button Control
1. Wire button between D2 and GND
2. Connect LED to D13
3. Upload button_led.ino
4. Press button to light LED

---

**Have fun experimenting with Arduino on the breadboard!** 🎉
