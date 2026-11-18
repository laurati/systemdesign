// Package snowflake gera IDs únicos de 64 bits, ordenáveis por tempo, sem
// coordenação entre máquinas (abordagem do Twitter Snowflake).
//
// Layout (64 bits):
//
//	| 1 bit sinal | 41 bits timestamp (ms desde epoch) | 5 bits datacenter | 5 bits máquina | 12 bits sequência |
//
// - 41 bits de ms ≈ 69 anos a partir da epoch customizada.
// - 5+5 bits = até 32 datacenters × 32 máquinas.
// - 12 bits = 4096 IDs por milissegundo por máquina.
package snowflake

import (
	"errors"
	"sync"
	"time"
)

const (
	datacenterBits = 5
	machineBits    = 5
	sequenceBits   = 12

	maxDatacenter = -1 ^ (-1 << datacenterBits) // 31
	maxMachine    = -1 ^ (-1 << machineBits)    // 31
	maxSequence   = -1 ^ (-1 << sequenceBits)   // 4095

	machineShift    = sequenceBits
	datacenterShift = sequenceBits + machineBits
	timestampShift  = sequenceBits + machineBits + datacenterBits
)

// Epoch customizada (2026-01-01). Começar perto de "agora" maximiza a vida útil.
var Epoch = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

var ErrClockMovedBackwards = errors.New("snowflake: relógio voltou no tempo")

type Generator struct {
	mu         sync.Mutex
	datacenter int64
	machine    int64
	lastMs     int64
	sequence   int64
	now        func() time.Time
}

func New(datacenter, machine int64) (*Generator, error) {
	if datacenter < 0 || datacenter > maxDatacenter || machine < 0 || machine > maxMachine {
		return nil, errors.New("snowflake: datacenter/machine fora do intervalo 0..31")
	}
	return &Generator{datacenter: datacenter, machine: machine, lastMs: -1, now: time.Now}, nil
}

func (g *Generator) Next() (int64, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	ms := g.now().Sub(Epoch).Milliseconds()
	if ms < g.lastMs {
		// NTP pode atrasar o relógio. Emitir IDs agora poderia gerar duplicatas.
		return 0, ErrClockMovedBackwards
	}
	if ms == g.lastMs {
		g.sequence = (g.sequence + 1) & maxSequence
		if g.sequence == 0 {
			// 4096 IDs esgotados neste ms: espera o próximo milissegundo.
			for ms <= g.lastMs {
				ms = g.now().Sub(Epoch).Milliseconds()
			}
		}
	} else {
		g.sequence = 0
	}
	g.lastMs = ms

	return ms<<timestampShift |
		g.datacenter<<datacenterShift |
		g.machine<<machineShift |
		g.sequence, nil
}

// Parts decompõe um ID — útil para depuração ("quando este ID foi criado?").
func Parts(id int64) (ts time.Time, datacenter, machine, sequence int64) {
	ms := id >> timestampShift
	return Epoch.Add(time.Duration(ms) * time.Millisecond),
		(id >> datacenterShift) & maxDatacenter,
		(id >> machineShift) & maxMachine,
		id & maxSequence
}
