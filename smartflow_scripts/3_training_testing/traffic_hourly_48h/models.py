"""
Model zoo for the 48-hour hourly forecast (thesis adviser's brief, 2026-10-23).

Every learned model reads the same inputs (see batches.py) and predicts all 48 hours x 3 classes in one pass (direct
multi-horizon), so a model never feeds its own errors back in:
  short   last 72 hours of the series: 3 class counts + rain + calendar        -> immediate fluctuations, peak transitions
  long    last 56 days as daily totals: 3 classes + weekday                     -> weekly / seasonal level and shape
  future  the 48 forecast hours: calendar, holiday, year-end, event day, and the same hour one and two weeks earlier
  series  which of the 32 plaza series it is (learned embedding)

  lstm1      single-layer LSTM(64) on `short`
  stacked    stacked LSTM 64 -> 32 on `short`
  dualpath   short branch LSTM 64 -> 32 (hourly, 72 h) + long branch LSTM 128 -> 64 -> 32 (daily, 56 d), joined by a
             trainable gate g = sigmoid(W [h_short, h_long, series]):  h = g * h_short + (1 - g) * h_long
The decoder is shared: the context vector is repeated for each of the 48 hours, joined with that hour's known features,
and two dense layers give the 3 class values for the hour.
"""
import keras
from keras import layers

H = 48


def _decoder(context, future, series_emb):
    ctx = layers.Concatenate()([context, series_emb])
    rep = layers.RepeatVector(H)(ctx)
    z = layers.Concatenate()([rep, future])
    z = layers.TimeDistributed(layers.Dense(96, activation="relu"))(z)
    z = layers.TimeDistributed(layers.Dropout(0.1))(z)
    return layers.TimeDistributed(layers.Dense(3))(z)


def build(kind, n_series, short_shape, long_shape, future_shape):
    short = keras.Input(short_shape, name="short")
    long = keras.Input(long_shape, name="long")
    future = keras.Input(future_shape, name="future")
    sid = keras.Input((1,), name="series", dtype="int32")
    emb = layers.Flatten()(layers.Embedding(n_series, 8)(sid))

    if kind == "lstm1":
        ctx = layers.LSTM(64)(short)
    elif kind == "stacked":
        x = layers.LSTM(64, return_sequences=True)(short); x = layers.Dropout(0.1)(x)
        ctx = layers.LSTM(32)(x)
    elif kind == "dualpath":
        s = layers.LSTM(64, return_sequences=True, name="short_lstm1")(short); s = layers.Dropout(0.1)(s)
        s = layers.LSTM(32, name="short_lstm2")(s)
        l = layers.LSTM(128, return_sequences=True, name="long_lstm1")(long); l = layers.Dropout(0.1)(l)
        l = layers.LSTM(64, return_sequences=True, name="long_lstm2")(l); l = layers.Dropout(0.1)(l)
        l = layers.LSTM(32, name="long_lstm3")(l)
        gate = layers.Dense(32, activation="sigmoid", name="fusion_gate")(layers.Concatenate()([s, l, emb]))
        ctx = layers.Add(name="gated_fusion")([layers.Multiply()([gate, s]),
                                               layers.Multiply()([layers.Lambda(lambda g: 1.0 - g)(gate), l])])
    else:
        raise ValueError(kind)
    out = _decoder(ctx, future, emb)
    m = keras.Model([short, long, future, sid], out, name=kind)
    m.compile(optimizer=keras.optimizers.Adam(1e-3), loss=keras.losses.Huber(delta=1.0))
    return m
