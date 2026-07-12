// Arduino Uno sketch interpreter
// Provides a simple runtime for Arduino C++ code that can interact with the circuit

// Pin mode constants
const INPUT = 0;
const OUTPUT = 1;
const INPUT_PULLUP = 2;

// Digital value constants
const LOW = 0;
const HIGH = 1;

// PWM-capable pins
const PWM_PINS = new Set([3, 5, 6, 9, 10, 11]);

export class ArduinoRuntime {
  constructor() {
    // Pin states
    this.pinModeState = new Array(20).fill(INPUT);  // 14 digital + 6 analog
    this.digitalState = new Array(20).fill(LOW);
    this.analogValues = new Array(6).fill(0);  // A0-A5 readings (0-1023)
    this.pwmValues = new Map();  // pin -> PWM value (0-255)

    // Timing
    this.millisStart = 0;
    this.microsStart = 0;

    // Serial buffer (for debugging)
    this.serialBuffer = [];
    this.serialVersion = 0;  // bumped on every print so UI can refresh efficiently

    // User code functions
    this.setupFn = null;
    this.loopFn = null;
    this.hasRunSetup = false;

    // External voltage inputs (set by simulator)
    this.externalVoltages = new Map();  // pin name -> voltage
  }

  // Arduino API: pinMode(pin, mode)
  pinMode(pin, mode) {
    if (pin >= 0 && pin < 20) {
      this.pinModeState[pin] = mode;
      if (mode === OUTPUT) this.digitalState[pin] = LOW;
    }
  }

  // Arduino API: digitalWrite(pin, value)
  digitalWrite(pin, value) {
    if (pin >= 0 && pin < 20 && this.pinModeState[pin] === OUTPUT) {
      this.digitalState[pin] = value ? HIGH : LOW;
      // Clear PWM if it was set
      if (this.pwmValues.has(pin)) this.pwmValues.delete(pin);
    }
  }

  // Arduino API: digitalRead(pin)
  digitalRead(pin) {
    if (pin < 0 || pin >= 20) return LOW;

    // If pin is input, read from external circuit
    if (this.pinModeState[pin] === INPUT || this.pinModeState[pin] === INPUT_PULLUP) {
      const pinName = pin < 14 ? `D${pin}` : `A${pin - 14}`;
      const voltage = this.externalVoltages.get(pinName) ?? 0;
      // Arduino threshold is typically 2.5V for 5V logic
      return voltage > 2.5 ? HIGH : LOW;
    }

    return this.digitalState[pin];
  }

  // Arduino API: analogRead(pin) - pin is 0-5 for A0-A5
  analogRead(pin) {
    if (pin < 0 || pin >= 6) return 0;

    // Read voltage from external circuit
    const pinName = `A${pin}`;
    const voltage = this.externalVoltages.get(pinName) ?? 0;

    // Convert 0-5V to 0-1023 (10-bit ADC)
    return Math.round(Math.min(1023, Math.max(0, (voltage / 5.0) * 1023)));
  }

  // Arduino API: analogWrite(pin, value) - PWM output
  analogWrite(pin, value) {
    if (pin >= 0 && pin < 20 && PWM_PINS.has(pin) && this.pinModeState[pin] === OUTPUT) {
      this.pwmValues.set(pin, Math.min(255, Math.max(0, value)));
    }
  }

  // Arduino API: millis()
  millis() {
    return performance.now() - this.millisStart;
  }

  // Arduino API: micros()
  micros() {
    return (performance.now() - this.microsStart) * 1000;
  }

  // Arduino API: delay(ms)
  delay(ms) {
    // Note: In real Arduino this blocks, but in JS we can't block the event loop
    // This is a limitation - we'll note it in the UI
    console.warn('delay() is not supported in web simulator - use millis() for timing');
  }

  // Arduino API: delayMicroseconds(us)
  delayMicroseconds(us) {
    console.warn('delayMicroseconds() is not supported in web simulator');
  }

  // Serial API (simplified)
  Serial = {
    begin: (baud) => {
      console.log(`Serial.begin(${baud})`);
    },
    print: (msg) => {
      this.serialBuffer.push(String(msg));
      this.serialVersion++;
      console.log('[Arduino]', msg);
    },
    println: (msg) => {
      this.serialBuffer.push(String(msg) + '\n');
      this.serialVersion++;
      console.log('[Arduino]', msg);
    },
    available: () => 0,
    read: () => -1,
  };

  // Get output voltage for a pin (for simulator)
  getPinVoltage(pinName) {
    let pinNum;
    if (pinName.startsWith('D')) {
      pinNum = parseInt(pinName.substring(1));
    } else if (pinName.startsWith('A')) {
      pinNum = 14 + parseInt(pinName.substring(1));
    } else {
      return 0;
    }

    if (pinNum < 0 || pinNum >= 20) return 0;
    if (this.pinModeState[pinNum] !== OUTPUT) return 0;

    // Check if PWM is active
    if (this.pwmValues.has(pinNum)) {
      const pwmValue = this.pwmValues.get(pinNum);
      return (pwmValue / 255) * 5.0;  // Convert PWM (0-255) to voltage (0-5V)
    }

    // Digital output
    return this.digitalState[pinNum] === HIGH ? 5.0 : 0;
  }

  // Reset the runtime
  reset() {
    this.pinModeState.fill(INPUT);
    this.digitalState.fill(LOW);
    this.analogValues.fill(0);
    this.pwmValues.clear();
    this.serialBuffer = [];
    this.serialVersion++;
    this.hasRunSetup = false;
    this.millisStart = performance.now();
    this.microsStart = performance.now();
  }

  // Load and parse Arduino code
  loadSketch(code) {
    this.reset();

    try {
      // Extract global variables (everything before setup() function)
      const setupIndex = code.indexOf('void setup');
      const globals = setupIndex > 0 ? code.substring(0, setupIndex) : '';

      // Extract setup() and loop() functions from Arduino C++ code
      const setupMatch = code.match(/void\s+setup\s*\(\s*\)\s*\{([\s\S]*?)\n\}/);
      const loopMatch = code.match(/void\s+loop\s*\(\s*\)\s*\{([\s\S]*?)\n\}/);

      if (!setupMatch && !loopMatch) {
        throw new Error('Could not find setup() or loop() functions');
      }

      // Convert Arduino C++ code to JavaScript
      const convertToJS = (cppCode) => {
        if (!cppCode) return '';

        return cppCode
          // Convert C++ types to JavaScript (must come first)
          .replace(/\bconst\s+int\s+/g, 'var ')
          .replace(/\blong\s+int\s+/g, 'var ')
          .replace(/\bunsigned\s+long\s+/g, 'var ')
          .replace(/\bunsigned\s+int\s+/g, 'var ')
          .replace(/\bint\s+/g, 'var ')
          .replace(/\bfloat\s+/g, 'var ')
          .replace(/\bbyte\s+/g, 'var ')
          .replace(/\blong\s+/g, 'var ')
          // Arduino function calls
          .replace(/pinMode\s*\(/g, 'this.pinMode(')
          .replace(/digitalWrite\s*\(/g, 'this.digitalWrite(')
          .replace(/digitalRead\s*\(/g, 'this.digitalRead(')
          .replace(/analogRead\s*\(/g, 'this.analogRead(')
          .replace(/analogWrite\s*\(/g, 'this.analogWrite(')
          .replace(/delay\s*\(/g, 'this.delay(')
          .replace(/delayMicroseconds\s*\(/g, 'this.delayMicroseconds(')
          .replace(/millis\s*\(/g, 'this.millis(')
          .replace(/micros\s*\(/g, 'this.micros(')
          .replace(/Serial\./g, 'this.Serial.')
          // Pin constants
          .replace(/\bINPUT\b/g, `${INPUT}`)
          .replace(/\bOUTPUT\b/g, `${OUTPUT}`)
          .replace(/\bINPUT_PULLUP\b/g, `${INPUT_PULLUP}`)
          .replace(/\bHIGH\b/g, `${HIGH}`)
          .replace(/\bLOW\b/g, `${LOW}`)
          // Analog pins
          .replace(/\bA0\b/g, '0')
          .replace(/\bA1\b/g, '1')
          .replace(/\bA2\b/g, '2')
          .replace(/\bA3\b/g, '3')
          .replace(/\bA4\b/g, '4')
          .replace(/\bA5\b/g, '5');
      };

      // Process globals (variable declarations) - convert C++ to JS
      let globalsJS = '';
      if (globals) {
        globalsJS = globals
          // Remove comments first
          .replace(/\/\/.*$/gm, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .trim();

        // Run through the same conversion as setup/loop to handle types and constants
        globalsJS = convertToJS(globalsJS);
      }

      // Create functions with shared global scope
      const setupJS = setupMatch ? convertToJS(setupMatch[1]) : '';
      const loopJS = loopMatch ? convertToJS(loopMatch[1]) : '';

      // Create closure with globals shared between setup and loop
      const factoryCode = `
        ${globalsJS}
        return {
          setup: function() { ${setupJS} },
          loop: function() { ${loopJS} }
        };
      `;

      const factory = new Function(factoryCode).call(this);
      this.setupFn = factory.setup;
      this.loopFn = factory.loop;

      return { success: true, error: null };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Execute one cycle of the Arduino runtime
  tick(dt) {
    try {
      // Run setup once
      if (!this.hasRunSetup && this.setupFn) {
        this.setupFn.call(this);
        this.hasRunSetup = true;
      }

      // Run loop
      if (this.loopFn) {
        this.loopFn.call(this);
      }
    } catch (err) {
      console.error('Arduino runtime error:', err.message || err);
      console.error('Stack:', err.stack);
    }
  }

  // Update external voltages from circuit (called by simulator)
  setExternalVoltage(pinName, voltage) {
    this.externalVoltages.set(pinName, voltage);
  }
}
