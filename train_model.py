"""
train_model.py
--------------
Re-trains the AI model and saves model.pkl.
You normally do NOT need this - the app trains the model by itself the first
time it starts. Run it only if you want to see the accuracy report:

    python train_model.py
"""
import ai

if __name__ == "__main__":
    ai.train_and_save(verbose=True)
    