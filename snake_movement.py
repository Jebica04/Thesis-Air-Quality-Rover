import time
import json
import warnings
import threading
import websocket
from enum import Enum, auto

# Hardware Integration Libraries
import board
import busio
import adafruit_ads1x15.ads1115 as ADS
from adafruit_ads1x15.analog_in import AnalogIn
from gpiozero import Motor, DistanceSensor

warnings.filterwarnings("ignore")

# =========================================================================
# ARCHITECTURE & HARDWARE CONFIGURATIONS
# =========================================================================
AWS_WS_URL = "wss://0oac11f8x8.execute-api.eu-north-1.amazonaws.com/production/"
DEVICE_ID = "ROVER-01-THESIS"
HEARTBEAT_INTERVAL = 3 

# Pin Configurations (BCM Numbers)
GPIO_ENA, GPIO_ENB = 12, 13
GPIO_IN1, GPIO_IN2 = 17, 27
GPIO_IN3, GPIO_IN4 = 22, 23
GPIO_TRIG, GPIO_ECHO = 25, 16 

# =========================================================================
# SUBSYSTEM INITIALIZATION LAYER
# =========================================================================
try:
    left_motor = Motor(forward=GPIO_IN1, backward=GPIO_IN2, enable=GPIO_ENA)
    right_motor = Motor(forward=GPIO_IN4, backward=GPIO_IN3, enable=GPIO_ENB)
    sonar_sensor = DistanceSensor(echo=GPIO_ECHO, trigger=GPIO_TRIG, max_distance=3.0)
except Exception as e:
    print(f"Failed to initialize GPIO Zero components: {str(e)}")
    exit(1)

# I2C/ADS1115 Initialization
try:
    i2c = busio.I2C(board.SCL, board.SDA)
    ads = ADS.ADS1115(i2c)
    ads.gain = 2/3  # Crucial for 5V MQ-135 scale reading safely
    
    mq135_pin = AnalogIn(ads, 0)   # Analog Pin A0
    voltage_pin = AnalogIn(ads, 1) # Analog Pin A1
    print("ADS1115 Hardware Bus successfully initialized.")
except Exception as e:
    print(f"Failed to link I2C hardware bus: {str(e)}")
    print("Check your physical jumper cable configuration!")
    exit(1)

# =========================================================================
# CONFIGURABLE CALIBRATION PARAMETERS
# =========================================================================
CAR_SPEED = 140 / 255.0        # Straight cruising speed (~0.55)
TURN_SPEED = 230 / 255.0       # Booster speed (~0.90) to overcome friction
WALL_CM = 25.0

TURN_RIGHT_90_S = 0.450        
TURN_LEFT_90_S = 0.500         
SPEED_PER_METER = 2.400        # Seconds it takes to cross 1 meter straight

STEP_METERS = 1.0              # Lane displacement gap
STOP_DELAY = 0.200             # Settling window to kill inertia
CLEAR_WALL_S = 0.500
ULTRASONIC_INTERVAL_S = 0.080

# =========================================================================
# GLOBAL NAVIGATION & THREAD SHARE STATES
# =========================================================================
class Heading(Enum):
    NORTH = 0
    EAST = 1
    SOUTH = 2
    WEST = 3

class State(Enum):
    GO_TO_WALL = auto()
    FIRST_TURN = auto()
    STEP_FORWARD = auto()
    SECOND_TURN = auto()
    CLEAR_WALL = auto()

# Shared coordinates initialized explicitly at the origin (0.0, 0.0)
current_x = 0.0
current_y = 0.0
current_heading = Heading.NORTH

current_state = State.GO_TO_WALL
turn_right_next = True  
current_distance = 999.0

# Driving State Flag to eliminate dead reckoning drift while stopped
is_moving_forward = False

# =========================================================================
# SENSOR PROCESSING UTILITIES
# =========================================================================
def get_live_ppm():
    raw_voltage = mq135_pin.voltage
    CLEAN_AIR_BASELINE = 3.3
    inverted_voltage = CLEAN_AIR_BASELINE - raw_voltage
    ppm = (inverted_voltage / CLEAN_AIR_BASELINE) * 500
    return max(0, min(500, int(ppm)))

def get_bus_voltage():
    scaled_voltage = voltage_pin.voltage * 5.0
    return round(scaled_voltage, 2)

# =========================================================================
# THREAD WORKER: AWS ASYNCHRONOUS TELEMETRY PIPELINE
# =========================================================================
def telemetry_worker():
    """Runs in background thread. Packages state vectors and broadcasts to cloud."""
    global current_x, current_y
    print(f"Asynchronous Telemetry Pipeline active for device [{DEVICE_ID}]")
    
    while True:
        try:
            ws = websocket.WebSocket()
            ws.connect(AWS_WS_URL)
            print("Telemetry cloud link handshake complete.")
            
            while True:
                current_ppm = get_live_ppm()
                current_voltage = get_bus_voltage()
                
                if current_ppm <= 50: status_tag = "GOOD"
                elif current_ppm <= 100: status_tag = "MODERATE"
                elif current_ppm <= 150: status_tag = "UNHEALTHY_SG"
                elif current_ppm <= 200: status_tag = "UNHEALTHY"
                elif current_ppm <= 300: status_tag = "VERY_UNHEALTHY"
                else: status_tag = "HAZARDOUS"
                
                # Cast dead reckoning variables directly to integers for the web app grid
                grid_x = max(0, min(int(current_x), 11))
                grid_y = max(0, min(int(current_y), 11))
                
                payload = {
                    "action": "sendTelemetry",
                    "data": {
                        "device_id": DEVICE_ID,
                        "timestamp": int(time.time()),
                        "air_quality_ppm": current_ppm,
                        "sensor_voltage": current_voltage,
                        "status": status_tag,
                        "x": grid_x,
                        "y": grid_y
                    }
                }
                
                ws.send(json.dumps(payload))
                time.sleep(HEARTBEAT_INTERVAL)
                
        except Exception as e:
            print(f"Telemetry connection dropout: {e}")
            print("Attempting cloud socket reconnect in 5 seconds...")
            time.sleep(5)

# =========================================================================
# MOTOR ORIENTATION ROUTINES
# =========================================================================
def forward():
    global is_moving_forward
    is_moving_forward = True
    left_motor.forward(CAR_SPEED)
    right_motor.forward(CAR_SPEED)

def left():
    global is_moving_forward
    is_moving_forward = False
    left_motor.backward(TURN_SPEED)
    right_motor.forward(TURN_SPEED)

def right():
    global is_moving_forward
    is_moving_forward = False
    left_motor.forward(TURN_SPEED)
    right_motor.backward(TURN_SPEED)

def stop_car():
    global is_moving_forward
    is_moving_forward = False
    left_motor.stop()
    right_motor.stop()

def do_turn(to_right):
    if to_right: right()
    else: left()

def get_turn_time(to_right):
    return TURN_RIGHT_90_S if to_right else TURN_LEFT_90_S

def update_dead_reckoning(duration, state):
    global current_x, current_y
    
    if not is_moving_forward:
        return

    if state in [State.GO_TO_WALL, State.CLEAR_WALL]:
        meters_moved = duration / SPEED_PER_METER
        if current_heading == Heading.NORTH: current_y += meters_moved
        elif current_heading == Heading.SOUTH: current_y -= meters_moved
    elif state == State.STEP_FORWARD:
        meters_moved = duration / SPEED_PER_METER
        if current_heading == Heading.EAST: current_x += meters_moved
        elif current_heading == Heading.WEST: current_x -= meters_moved

    # --- FIX 2: HARD BOUNDING LIMITS ---
    # Stops values from climbing into unreachable areas like 14.13
    current_x = max(0.0, min(current_x, 11.0))
    current_y = max(0.0, min(current_y, 11.0))

# =========================================================================
# MAIN CONTROLLER INITIALIZATION ENTRY
# =========================================================================
if __name__ == "__main__":
    print("Initializing Master Control Thread Sequence...")
    
    bg_telemetry_thread = threading.Thread(target=telemetry_worker, daemon=True)
    bg_telemetry_thread.start()
    
    print("Rover navigation loop active. Target vehicle placement deployment window open (5s)...")
    time.sleep(5)
    
    state_start = time.time()
    last_coord_update = time.time()
    last_ultrasonic_read = 0
    
    try:
        while True:
            now = time.time()
            delta_time = now - last_coord_update
            last_coord_update = now
            
            # 1. Update position integration
            update_dead_reckoning(delta_time, current_state)
            
            # 2. Query Ultrasonic Sensor
            if (now - last_ultrasonic_read) >= ULTRASONIC_INTERVAL_S:
                current_distance = sonar_sensor.distance * 100.0
                last_ultrasonic_read = now
                print(f"Pos: ({int(current_x)}, {int(current_y)}) | Raw: ({current_x:.2f}, {current_y:.2f}) | Head: {current_heading.name} | Dist: {current_distance:.1f} cm")

            # 3. Finite State Machine Router Logic
            if current_state == State.GO_TO_WALL:
                if current_distance > WALL_CM:
                    forward()
                else:
                    stop_car()
                    time.sleep(STOP_DELAY)
                    current_state = State.FIRST_TURN
                    state_start = time.time()

            elif current_state == State.FIRST_TURN:
                do_turn(turn_right_next)
                if (now - state_start) >= get_turn_time(turn_right_next):
                    stop_car()
                    # --- FIX 1: ORIENTATION LOGIC FIXED HERE ---
                    # Whether turning right from NORTH or left from SOUTH, 
                    # the lateral sweep step is always heading EAST to advance lanes.
                    current_heading = Heading.EAST 
                    time.sleep(STOP_DELAY)
                    current_state = State.STEP_FORWARD
                    state_start = time.time()

            elif current_state == State.STEP_FORWARD:
                forward()
                if (now - state_start) >= (STEP_METERS * SPEED_PER_METER):
                    stop_car()
                    time.sleep(STOP_DELAY)
                    current_state = State.SECOND_TURN
                    state_start = time.time()

            elif current_state == State.SECOND_TURN:
                do_turn(turn_right_next)
                if (now - state_start) >= get_turn_time(turn_right_next):
                    stop_car()
                    # If turn_right_next was True, we turned right from EAST -> SOUTH
                    # If turn_right_next was False, we turned left from EAST -> NORTH
                    current_heading = Heading.SOUTH if turn_right_next else Heading.NORTH
                    time.sleep(STOP_DELAY)
                    
                    turn_right_next = not turn_right_next  # Toggle turn side for next wall encounter
                    current_state = State.CLEAR_WALL
                    state_start = time.time()

            elif current_state == State.CLEAR_WALL:
                forward()
                if (now - state_start) >= CLEAR_WALL_S:
                    stop_car()
                    time.sleep(STOP_DELAY)
                    current_distance = 999.0
                    current_state = State.GO_TO_WALL
                    state_start = time.time()

            time.sleep(0.01)

    except KeyboardInterrupt:
        print("\n Telemetry Core & Navigation Aborted Safely via Hardware Interrupt.")
        
    finally:
        print("Freeing active system level pin handles...")
        stop_car()
        try:
            left_motor.close()
            right_motor.close()
            sonar_sensor.close()
        except:
            pass
        print("PIO pipelines clean and ready for immediate restart.")
