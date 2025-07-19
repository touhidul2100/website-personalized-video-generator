import subprocess
import threading
import time

# Record the start time
start_time = time.time()

# Function to display log messages with timestamps
def log_message(message):
    elapsed = time.time() - start_time
    elapsed_minutes = int(elapsed // 60)
    elapsed_seconds = int(elapsed % 60)
    print(f"[{elapsed_minutes:02}:{elapsed_seconds:02}] {message}")

# Function to run a script
def run_script(command, delay=0):
    if delay > 0:
        log_message(f"Waiting {delay / 60} minutes before starting {command[1]}...")
        time.sleep(delay)  # Delay in seconds
    log_message(f"Starting script: {command[1]}")
    subprocess.Popen(command).wait()
    log_message(f"Finished script: {command[1]}")

# Commands to run
cmd1 = ["node", "screenshot.js"]         # Script 1
cmd2 = ["python", "personalVideo.py"]    # Script 2
cmd3 = ["node", "uploadLoom.js"]         # Script 3

# Delays (in seconds) relative to when Script 1 starts
delay_script2 = 4 * 60  # Start 2 minutes after Script 1
delay_script3 = 10* 60  # Start 8 minutes after Script 1

# Start Script 1 immediately
thread1 = threading.Thread(target=run_script, args=(cmd1,))
thread1.start()

# Start Script 2 after a delay
thread2 = threading.Thread(target=run_script, args=(cmd2, delay_script2))
thread2.start()

# Start Script 3 after a delay
thread3 = threading.Thread(target=run_script, args=(cmd3, delay_script3))
thread3.start()

# Wait for all threads to finish
thread1.join()
thread2.join()
thread3.join()

log_message("All scripts have been executed.")
