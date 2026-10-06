package main

import (
	"os"
	"syscall"
	"unsafe"
)

var lockFileEx = syscall.NewLazyDLL("kernel32.dll").NewProc("LockFileEx")

func lockInstance(file *os.File, exclusive bool) error {
	const (
		lockFailImmediately = 0x00000001
		lockExclusive       = 0x00000002
	)
	flags := uintptr(lockFailImmediately)
	if exclusive {
		flags |= lockExclusive
	}
	// All instances lock the first byte, including on an empty file. Closing
	// the handle releases the lock, matching flock's lifetime on Unix.
	var overlapped syscall.Overlapped
	result, _, err := lockFileEx.Call(file.Fd(), flags, 0, 1, 0, uintptr(unsafe.Pointer(&overlapped)))
	if result == 0 {
		return err
	}
	return nil
}
