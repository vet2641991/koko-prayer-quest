"""Run a command in a pseudo-terminal and answer every question it asks with its default (Enter).

eas-cli creates an Apple distribution certificate only in interactive mode; with an App Store Connect API key in the
environment it asks only yes/no questions whose default is the right answer. Usage:
    python3 accept-defaults.py npx eas-cli credentials:configure-build --platform ios --profile production
Exits with the command's exit code; gives up after 20 minutes.
"""
import os, pty, select, sys, time

pid, fd = pty.fork()
if pid == 0:
    os.execvp(sys.argv[1], sys.argv[1:])

deadline, last_enter = time.time() + 20 * 60, 0.0
while True:
    if time.time() > deadline:
        os.kill(pid, 9)
        sys.exit("Timed out waiting for the command.")
    ready, _, _ = select.select([fd], [], [], 0.5)
    if ready:
        try:
            data = os.read(fd, 4096)
        except OSError:   # the command closed the terminal: it has finished
            break
        if not data:
            break
        sys.stdout.buffer.write(data)
        sys.stdout.flush()
    if time.time() - last_enter > 2:
        os.write(fd, b"\r")
        last_enter = time.time()

_, status = os.waitpid(pid, 0)
sys.exit(os.waitstatus_to_exitcode(status))
