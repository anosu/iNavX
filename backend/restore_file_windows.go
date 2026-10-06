package main

import (
	"syscall"
	"unsafe"
)

var moveFileEx = syscall.NewLazyDLL("kernel32.dll").NewProc("MoveFileExW")

func replaceDatabaseFile(source, destination string) error {
	from, err := syscall.UTF16PtrFromString(source)
	if err != nil {
		return err
	}
	to, err := syscall.UTF16PtrFromString(destination)
	if err != nil {
		return err
	}
	// Keep replacement on the same volume and request write-through. Windows
	// does not support the directory fsync used after rename on Unix.
	const moveReplaceExisting = 0x00000001
	const moveWriteThrough = 0x00000008
	result, _, err := moveFileEx.Call(uintptr(unsafe.Pointer(from)), uintptr(unsafe.Pointer(to)), moveReplaceExisting|moveWriteThrough)
	if result == 0 {
		return err
	}
	return nil
}
