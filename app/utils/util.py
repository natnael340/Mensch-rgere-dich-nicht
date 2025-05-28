import yaml
import json
import functools

def load_yaml(file_path):
    """
    Load a YAML file and return its content.
    
    :param file_path: Path to the YAML file.
    :return: Content of the YAML file as a dictionary.
    """
    with open(file_path, 'r', encoding='utf-8') as file:
        return yaml.safe_load(file)
    

def raft_command(command: str):
    def decorator(func):
        #@functools.wraps(func)
        def wrapper(*args, **kwargs):
                
            print(f"Executing command: {command} with code: ")
            print(json.dumps(args[1:]))
            return func(*args, **kwargs)
        return wrapper
    return decorator