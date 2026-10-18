#!/usr/bin/env python3
"""Build the approved two-minute synchronized Hero Auction arena soundtrack."""
import os, wave, subprocess
import numpy as np
from scipy.signal import butter, sosfilt
sr=22050; bpm=120; beat=60/bpm; bars=60; length=120
rng=np.random.default_rng(20261018)
mix=np.zeros(sr*length,dtype=np.float32)
def put(sec,x,g=1):
 i=int(sec*sr)
 if i<0 or i>=len(mix):return
 n=min(len(x),len(mix)-i)
 mix[i:i+n]+=x[:n]*g
def osc(f,d,kind="sine",attack=.012,release=.13):
 t=np.arange(int(d*sr),dtype=np.float32)/sr
 phase=2*np.pi*f*t
 if kind=="triangle":y=2/np.pi*np.arcsin(np.sin(phase))
 elif kind=="brass":y=np.sin(phase)+.34*np.sin(2*phase)+.14*np.sin(3*phase)
 elif kind=="string":y=np.sin(phase)+.22*np.sin(2*phase)+.16*np.sin(3*phase)+.08*np.sin(4*phase)
 else:y=np.sin(phase)
 env=np.minimum(1,t/max(attack,.001))*np.minimum(1,(d-t)/max(release,.001))
 return (y*np.maximum(env,0)).astype(np.float32)
def kick():
 t=np.arange(int(.38*sr))/sr
 phase=2*np.pi*(48*t+110*(1-np.exp(-t*32))/32)
 return (np.sin(phase)*np.exp(-t*17)+.17*rng.standard_normal(len(t))*np.exp(-t*75)).astype(np.float32)
def tom(f=100):
 t=np.arange(int(.33*sr))/sr
 phase=2*np.pi*(f*t+32*(1-np.exp(-t*21))/21)
 return (np.sin(phase)*np.exp(-t*13)).astype(np.float32)
def snare():
 t=np.arange(int(.21*sr))/sr
 noise=sosfilt(butter(2,900,btype="high",fs=sr,output="sos"),rng.standard_normal(len(t)))
 return (noise*.25+np.sin(2*np.pi*185*t)*.25)*np.exp(-t*23)
def hat():
 t=np.arange(int(.085*sr))/sr
 noise=sosfilt(butter(2,4500,btype="high",fs=sr,output="sos"),rng.standard_normal(len(t)))
 return (noise*np.exp(-t*62)*.12).astype(np.float32)
K=kick();S=snare();H=hat();T1=tom(105);T2=tom(80)
chords=[(55,[220,261.63,329.63]),(43.65,[174.61,220,261.63]),(49,[196,246.94,293.66]),(41.2,[164.81,196,246.94])]
for bar in range(bars):
 t0=bar*4*beat;root,notes=chords[(bar//4)%4]
 intro=bar<4;breakdown=32<=bar<36;finale=48<=bar<56;fade=bar>=56
 intensity=.55 if intro else (.65 if breakdown else 1.1 if finale else .92)
 if fade:intensity*=max(.12,(60-bar)/4)
 for n in notes:
  put(t0,osc(n,2.05,"string",.2,.45),.026*intensity)
  if bar>=8 and not breakdown:put(t0,osc(n/2,1.85,"brass",.13,.4),.021*intensity)
 for q in range(4):
  pos=t0+q*beat
  if not intro or q in (0,2):
   put(pos,K,.36*intensity)
   put(pos,osc(root,.33,"triangle",.005,.21),.20*intensity)
   put(pos,osc(root/2,.24,"sine",.004,.18),.16*intensity)
  if q in (1,3) and not intro:put(pos,S,.32*intensity)
  if not intro and not breakdown:
   put(pos,H,.25*intensity);put(pos+beat/2,H,.28*intensity)
 if bar>=8 and not breakdown:
  for q,n in enumerate([notes[0]*2,notes[2]*2,notes[1]*2,notes[2]*2]):
   put(t0+q*beat,osc(n,.36,"brass",.035,.16),.044*intensity)
 if bar%8==7 and not fade:
  for k in range(4):put(t0+2*beat+k*beat/2,T1 if k%2==0 else T2,.18*intensity)
mix=np.tanh(mix*1.4)
mix[:sr//2]*=np.linspace(0,1,sr//2)
mix[-sr*2:]*=np.linspace(1,0,sr*2)
os.makedirs("public/audio",exist_ok=True)
wav="/tmp/hero-auction-arena.wav"
with wave.open(wav,"wb") as f:
 f.setnchannels(1);f.setsampwidth(2);f.setframerate(sr)
 f.writeframes((mix*32767).astype("<i2").tobytes())
subprocess.run(["ffmpeg","-y","-loglevel","error","-i",wav,"-codec:a","libmp3lame","-b:a","160k","public/audio/hero-auction-senkron-davul-bas-2dk.mp3"],check=True)
print("Generated 120s approved synchronized arena MP3")
