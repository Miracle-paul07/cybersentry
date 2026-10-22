"""
CyberSentry - deep learning models for Stage 2 (attack-type classification).

Shared by the training notebook (04_dl_classification.ipynb) and the dashboard,
so a saved model can be rebuilt with exactly the same architecture.

Each flow is a vector of selected features. MLP treats it as a plain vector;
CNN / LSTM / GRU treat the features as a 1-D sequence (one value per step),
which is a common approach in IDS literature for tabular flow data.
"""
import numpy as np
import torch
import torch.nn as nn


class MLP(nn.Module):
    def __init__(self, n_features, n_classes, hidden=(256, 128, 64), dropout=0.3):
        super().__init__()
        layers, prev = [], n_features
        for h in hidden:
            layers += [nn.Linear(prev, h), nn.BatchNorm1d(h), nn.ReLU(), nn.Dropout(dropout)]
            prev = h
        layers.append(nn.Linear(prev, n_classes))
        self.net = nn.Sequential(*layers)

    def forward(self, x):
        return self.net(x)


class CNN1D(nn.Module):
    def __init__(self, n_features, n_classes, dropout=0.3):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv1d(1, 32, kernel_size=3, padding=1), nn.BatchNorm1d(32), nn.ReLU(),
            nn.Conv1d(32, 64, kernel_size=3, padding=1), nn.BatchNorm1d(64), nn.ReLU(),
            nn.MaxPool1d(2),
        )
        self.head = nn.Sequential(
            nn.Flatten(), nn.Linear(64 * (n_features // 2), 128), nn.ReLU(), nn.Dropout(dropout),
            nn.Linear(128, n_classes),
        )

    def forward(self, x):
        return self.head(self.conv(x.unsqueeze(1)))


class RNNClassifier(nn.Module):
    def __init__(self, n_features, n_classes, cell="lstm", hidden=64, dropout=0.3):
        super().__init__()
        rnn = nn.LSTM if cell == "lstm" else nn.GRU
        self.rnn = rnn(input_size=1, hidden_size=hidden, batch_first=True)
        self.head = nn.Sequential(nn.Dropout(dropout), nn.Linear(hidden, n_classes))

    def forward(self, x):
        out, _ = self.rnn(x.unsqueeze(-1))
        return self.head(out[:, -1, :])


def build_model(arch, n_features, n_classes):
    if arch == "MLP":
        return MLP(n_features, n_classes)
    if arch == "1D-CNN":
        return CNN1D(n_features, n_classes)
    if arch == "LSTM":
        return RNNClassifier(n_features, n_classes, cell="lstm")
    if arch == "GRU":
        return RNNClassifier(n_features, n_classes, cell="gru")
    raise ValueError(f"Unknown architecture: {arch}")


def log_transform(X):
    """Signed log1p: tames the very heavy-tailed flow features before scaling."""
    X = np.asarray(X, dtype=np.float64)
    return np.sign(X) * np.log1p(np.abs(X))


@torch.no_grad()
def predict_proba(model, X, batch_size=8192):
    """X: already transformed float32 array. Returns softmax probabilities."""
    model.eval()
    out = []
    for i in range(0, len(X), batch_size):
        xb = torch.as_tensor(X[i:i + batch_size], dtype=torch.float32)
        out.append(torch.softmax(model(xb), dim=1).numpy())
    return np.vstack(out)


def load_classifier(path):
    """Rebuild a saved Stage-2 model. Returns (model, checkpoint dict)."""
    ckpt = torch.load(path, map_location="cpu", weights_only=False)
    model = build_model(ckpt["arch"], ckpt["n_features"], len(ckpt["classes"]))
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    return model, ckpt
