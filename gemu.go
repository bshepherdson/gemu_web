package main

import (
	"io"
	"net"
	"reflect"
	"unsafe"
)

type PacketType uint16

const (
	PacketClassList              PacketType = 0x0001
	PacketClassListResponse                 = 0x8001
	PacketCreateDT                          = 0x0101
	PacketCreateDTResponse                  = 0x8101
	PacketDeleteDT                          = 0x0102
	PacketDeleteDTResponse                  = 0x8102
	PacketAttachDTDevice                    = 0x0103
	PacketAttachDTDeviceResponse            = 0x8103
	PacketRemoveDTDevice                    = 0x0104
	PacketRemoveDTDeviceResponse            = 0x8104
	PacketStartDT                           = 0x0105
	PacketStartDTResponse                   = 0x8105
	PacketStopDT                            = 0x0106
	PacketStopDTResponse                    = 0x8106
	PacketResetDT                           = 0x0107
	PacketResetDTResponse                   = 0x8107
	PacketSendDeviceMessage                 = 0x0110
	PacketRequestStateSync                  = 0x0120
	PacketRequestMemSync                    = 0x0121
	PacketCancelStateSync                   = 0x0122
	PacketCancelMemSync                     = 0x0123
	PacketStateSync                         = 0x0130
	PacketMemSync                           = 0x0131
)

type Packet struct {
	DTID  uint32
	DevID uint16
	Type  PacketType
	TXID  uint16

	body []byte

	curpos int
}

func (P *Packet) WriteUInt8(val uint8) {
	P.body = append(P.body, val)
}

func (P *Packet) WriteUInt16(val uint16) {
	P.body = append(P.body, byte(val), byte(val>>8))
}

func (P *Packet) WriteUInt32(val uint32) {
	P.body = append(P.body, byte(val>>0), byte(val>>8), byte(val>>16), byte(val>>24))
}

func (P *Packet) WriteInt32(val int32) {
	P.WriteUInt32(uint32(val))
}

func (P *Packet) WriteBytes(val []byte) {
	P.body = append(P.body, val...)
}

func (P *Packet) WriteWords(val []uint16) {
	rawData := []byte{}
	bytesHeader := (*reflect.SliceHeader)(unsafe.Pointer(&rawData))
	bytesHeader.Data = uintptr(unsafe.Pointer(&val[0]))
	bytesHeader.Len = len(val) * 2
	bytesHeader.Cap = len(val) * 2

	P.body = append(P.body, rawData...)
}

func (P *Packet) CurPos() uint16 {
	return uint16(len(P.body))
}

func (P *Packet) WriteUInt8At(val uint8, at uint16) {
	P.body[at] = val
}

func (P *Packet) WriteUInt16At(val uint16, at uint16) {
	*(*uint16)(unsafe.Pointer(&(P.body[at]))) = val
}

func (P *Packet) WriteString(val string) {
	P.WriteUInt16(uint16(len(val)))
	P.body = append(P.body, []byte(val)...)
}

func (P *Packet) ReadUInt8() (val uint8) {
	if P.curpos >= len(P.body) {
		return 0
	}
	val = P.body[P.curpos]
	P.curpos++
	return
}

func (P *Packet) ReadUInt16() (val uint16) {
	if P.curpos+1 >= len(P.body) {
		return 0
	}
	val = *(*uint16)(unsafe.Pointer(&(P.body[P.curpos])))
	P.curpos += 2
	return
}

func (P *Packet) ReadUInt32() (val uint32) {
	if P.curpos+3 >= len(P.body) {
		return 0
	}
	val = *(*uint32)(unsafe.Pointer(&(P.body[P.curpos])))
	P.curpos += 4
	return
}

func (P *Packet) ReadInt32() (val int32) {
	if P.curpos+3 >= len(P.body) {
		return 0
	}
	val = *(*int32)(unsafe.Pointer(&(P.body[P.curpos])))
	P.curpos += 4
	return
}

func (P *Packet) ReadString() (val string) {
	length := P.ReadUInt16()
	if P.curpos+int(length) >= len(P.body) {
		return ""
	}
	val = string(P.body[P.curpos : P.curpos+int(length)])
	P.curpos += int(length)
	return
}

func (P *Packet) ReadParameter() (val *Parameter) {
	if P.curpos >= len(P.body) {
		return nil
	}
	tag := P.ReadUInt8()
	tlen := P.ReadUInt8()
	if P.curpos+int(tlen) >= len(P.body) {
		val = &Parameter{tag: tag, data: P.body[P.curpos:]}
		P.curpos = len(P.body)
		return
	}
	val = &Parameter{tag: tag, data: P.body[P.curpos : P.curpos+int(tlen)]}
	P.curpos += int(tlen)
	return
}

func (P *Packet) Valid() bool {
	return P.curpos < len(P.body)
}

type Parameter struct {
	tag  uint8
	data []byte
}

func (P *Parameter) UInt32() uint32 {
	if len(P.data) < 4 {
		return 0
	}
	return *(*uint32)(unsafe.Pointer(&(P.data[0])))
}

func (P *Parameter) UInt64() uint64 {
	if len(P.data) < 8 {
		return 0
	}
	return *(*uint64)(unsafe.Pointer(&(P.data[0])))
}

func (P *Parameter) String() string {
	return string(P.data)
}

type Parameters []*Parameter

func (P Parameters) GetTag(tag uint8) *Parameter {
	for _, param := range P {
		if param != nil && param.tag == tag {
			return param
		}
	}
	return nil
}

func (P *Packet) ReadParameters() Parameters {
	params := []*Parameter{}
	paramCount := P.ReadUInt16()
	for l1 := uint16(0); l1 < paramCount; l1++ {
		param := P.ReadParameter()
		if param == nil {
			break
		}
		params = append(params, param)
	}
	return params
}

func (p *Packet) send(socket net.Conn) error {
	*(*uint32)(unsafe.Pointer(&(p.body[0]))) = p.DTID
	*(*uint16)(unsafe.Pointer(&(p.body[4]))) = p.DevID
	*(*uint16)(unsafe.Pointer(&(p.body[6]))) = uint16(p.Type)
	*(*uint16)(unsafe.Pointer(&(p.body[8]))) = p.TXID
	*(*uint16)(unsafe.Pointer(&(p.body[10]))) = uint16(len(p.body) - 12)
	_, err := socket.Write(p.body)
	if err != nil {
		return err
	}
	return nil
}

func recv(socket net.Conn) (*Packet, error) {
	p := &Packet{}
	p.body = make([]byte, 12)
	_, err := io.ReadFull(socket, p.body)
	if err != nil {
		return nil, err
	}
	p.DTID = p.ReadUInt32()
	p.DevID = p.ReadUInt16()
	p.Type = PacketType(p.ReadUInt16())
	p.TXID = p.ReadUInt16()
	length := p.ReadUInt16()
	newBody := make([]byte, 12+length)
	copy(newBody, p.body)
	p.body = newBody
	_, err = io.ReadFull(socket, p.body[12:])
	if err != nil {
		return nil, err
	}
	return p, nil
}

func NewPacket(DTID uint32, DevID uint16, Type PacketType, TXID uint16) *Packet {
	p := &Packet{}
	p.body = make([]byte, 12)
	p.curpos = 12
	p.DTID = DTID
	p.DevID = DevID
	p.Type = Type
	p.TXID = TXID
	return p
}
