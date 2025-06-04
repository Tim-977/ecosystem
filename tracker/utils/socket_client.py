import socket
import json


def send_render_request(data):
    """
    data: dict containing keys "user_id", "year", "activity_log", "color_map"
    Returns: parsed JSON response from C++ server (dict)
    """
    HOST = '127.0.0.1'
    PORT = 9090

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.connect((HOST, PORT))
        message = json.dumps(data).encode('utf-8')
        s.sendall(message)
        s.shutdown(socket.SHUT_WR)

        response_chunks = []
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            response_chunks.append(chunk)
        response_data = b''.join(response_chunks).decode('utf-8')

    try:
        return json.loads(response_data)
    except json.JSONDecodeError:
        print("Invalid JSON in response:", response_data)
        return None


if __name__ == '__main__':
    payload = {
        "user_id": 42,
        "year": 2025,
        "activity_log": [1, 2, 3, 4],
        "color_map": {
            "1": "#ff0000",
            "2": "#00ff00",
            "3": "#0000ff",
            "4": "#ffff00"
        }
    }
    resp = send_render_request(payload)
    print("Response from C++ server:", resp)
