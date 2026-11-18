package notification

import (
	"context"
	"errors"
	"testing"
	"time"
)

type flaky struct {
	failures int
	calls    int
	err      error
}

func (f *flaky) Send(ctx context.Context, m Message) error {
	f.calls++
	if f.calls <= f.failures {
		return f.err
	}
	return nil
}

func TestRetryThenSuccessAndIdempotency(t *testing.T) {
	p := &flaky{failures: 2, err: errors.New("503")}
	var slept []time.Duration
	w := &Worker{Provider: p, MaxAttempts: 5, BaseDelay: 100 * time.Millisecond, Sleep: func(d time.Duration) { slept = append(slept, d) }}

	m := Message{ID: "n-1", UserID: "u", Channel: "push", Body: "Seu pedido saiu"}
	if err := w.Handle(context.Background(), m); err != nil {
		t.Fatal(err)
	}
	if p.calls != 3 || len(slept) != 2 || slept[1] < 200*time.Millisecond {
		t.Fatalf("calls=%d slept=%v", p.calls, slept)
	}
	// A fila reentrega a mesma mensagem: não pode enviar de novo.
	_ = w.Handle(context.Background(), m)
	if p.calls != 3 {
		t.Fatal("duplicata enviada — idempotência quebrada")
	}
}

func TestPermanentGoesToDLQ(t *testing.T) {
	p := &flaky{failures: 100, err: ErrPermanent}
	w := &Worker{Provider: p, MaxAttempts: 5, BaseDelay: time.Millisecond, Sleep: func(time.Duration) {}}
	_ = w.Handle(context.Background(), Message{ID: "n-2"})
	if p.calls != 1 || len(w.DeadLetter) != 1 {
		t.Fatalf("erro permanente não deve ter retry: calls=%d dlq=%d", p.calls, len(w.DeadLetter))
	}
}
