# -*- coding: utf-8 -*-
# Generated by the protocol buffer compiler.  DO NOT EDIT!
# NO CHECKED-IN PROTOBUF GENCODE
# source: raft.proto
# Protobuf Python Version: 5.29.0
"""Generated protocol buffer code."""
from google.protobuf import descriptor as _descriptor
from google.protobuf import descriptor_pool as _descriptor_pool
from google.protobuf import runtime_version as _runtime_version
from google.protobuf import symbol_database as _symbol_database
from google.protobuf.internal import builder as _builder
_runtime_version.ValidateProtobufRuntimeVersion(
    _runtime_version.Domain.PUBLIC,
    5,
    29,
    0,
    '',
    'raft.proto'
)
# @@protoc_insertion_point(imports)

_sym_db = _symbol_database.Default()




DESCRIPTOR = _descriptor_pool.Default().AddSerializedFile(b'\n\nraft.proto\x12\x04raft\"c\n\x0eRequestVoteRPC\x12\x0c\n\x04term\x18\x01 \x01(\x05\x12\x14\n\x0c\x63\x61ndidate_id\x18\x02 \x01(\t\x12\x16\n\x0elast_log_index\x18\x03 \x01(\x05\x12\x15\n\rlast_log_term\x18\x04 \x01(\x05\"M\n\x10RequestVoteReply\x12\x0c\n\x04term\x18\x01 \x01(\x05\x12\x14\n\x0cvote_granted\x18\x02 \x01(\x08\x12\x15\n\rleader_active\x18\x03 \x01(\x08\")\n\x08LogEntry\x12\x0c\n\x04term\x18\x01 \x01(\x05\x12\x0f\n\x07\x63ommand\x18\x02 \x01(\t\"\x9a\x01\n\x10\x41ppendEntriesRPC\x12\x0c\n\x04term\x18\x01 \x01(\x05\x12\x11\n\tleader_id\x18\x02 \x01(\t\x12\x16\n\x0eprev_log_index\x18\x03 \x01(\x05\x12\x15\n\rprev_log_term\x18\x04 \x01(\x05\x12\x1f\n\x07\x65ntries\x18\x05 \x03(\x0b\x32\x0e.raft.LogEntry\x12\x15\n\rleader_commit\x18\x06 \x01(\x05\"3\n\x12\x41ppendEntriesReply\x12\x0c\n\x04term\x18\x01 \x01(\x05\x12\x0f\n\x07success\x18\x02 \x01(\x08\x32\x86\x01\n\x04Raft\x12\x41\n\rAppendEntries\x12\x16.raft.AppendEntriesRPC\x1a\x18.raft.AppendEntriesReply\x12;\n\x0bRequestVote\x12\x14.raft.RequestVoteRPC\x1a\x16.raft.RequestVoteReplyb\x06proto3')

_globals = globals()
_builder.BuildMessageAndEnumDescriptors(DESCRIPTOR, _globals)
_builder.BuildTopDescriptorsAndMessages(DESCRIPTOR, 'raft_pb2', _globals)
if not _descriptor._USE_C_DESCRIPTORS:
  DESCRIPTOR._loaded_options = None
  _globals['_REQUESTVOTERPC']._serialized_start=20
  _globals['_REQUESTVOTERPC']._serialized_end=119
  _globals['_REQUESTVOTEREPLY']._serialized_start=121
  _globals['_REQUESTVOTEREPLY']._serialized_end=198
  _globals['_LOGENTRY']._serialized_start=200
  _globals['_LOGENTRY']._serialized_end=241
  _globals['_APPENDENTRIESRPC']._serialized_start=244
  _globals['_APPENDENTRIESRPC']._serialized_end=398
  _globals['_APPENDENTRIESREPLY']._serialized_start=400
  _globals['_APPENDENTRIESREPLY']._serialized_end=451
  _globals['_RAFT']._serialized_start=454
  _globals['_RAFT']._serialized_end=588
# @@protoc_insertion_point(module_scope)
