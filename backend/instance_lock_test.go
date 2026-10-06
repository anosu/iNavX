package main

import "testing"

func TestInstanceLockSharedAndExclusive(t *testing.T) {
	c := Config{DataDir: t.TempDir()}
	first, err := instanceLock(c, false)
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	second, err := instanceLock(c, false)
	if err != nil {
		t.Fatalf("shared operations must coexist: %v", err)
	}
	defer second.Close()
	if file, err := instanceLock(c, true); err == nil {
		file.Close()
		t.Fatal("exclusive operation must not run alongside shared operations")
	}
	first.Close()
	if file, err := instanceLock(c, true); err == nil {
		file.Close()
		t.Fatal("remaining shared handle must still prevent exclusive operation")
	}
	second.Close()
	exclusive, err := instanceLock(c, true)
	if err != nil {
		t.Fatalf("closing all shared handles must release locks: %v", err)
	}
	defer exclusive.Close()
	for _, mode := range []bool{false, true} {
		if file, err := instanceLock(c, mode); err == nil {
			file.Close()
			t.Fatalf("exclusive handle must reject new lock (exclusive=%v)", mode)
		}
	}
	exclusive.Close()
	last, err := instanceLock(c, false)
	if err != nil {
		t.Fatalf("closing exclusive handle must release lock: %v", err)
	}
	last.Close()
}
