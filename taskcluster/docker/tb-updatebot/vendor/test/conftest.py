import os
import sys

HERE = os.path.dirname(__file__)
EXT_PATH = os.path.abspath(os.path.join(HERE, "..", ".."))

sys.path.insert(0, EXT_PATH)
