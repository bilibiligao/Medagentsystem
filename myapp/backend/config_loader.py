import yaml
import os
import logging

class ConfigLoader:
    def __init__(self, config_path="config/config.yaml"):
        self.config_path = os.path.join(os.path.dirname(__file__), config_path)
        self.config = self.load_config()
        self.setup_logging()

    def load_config(self):
        if not os.path.exists(self.config_path):
            print(f"Config file not found at {self.config_path}, using defaults.")
            return {}
        with open(self.config_path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)

    def setup_logging(self):
        log_level_str = self.config.get("logging", {}).get("level", "INFO")
        log_level = getattr(logging, log_level_str.upper(), logging.INFO)
        log_file = self.config.get("logging", {}).get("file_path", "backend.log")
        
        logging.basicConfig(
            level=log_level,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_file, encoding='utf-8'),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger("MedGemma")

    def get(self, key, default=None):
        keys = key.split('.')
        value = self.config
        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default
        return value

CONFIG = ConfigLoader()
LOGGER = CONFIG.logger
