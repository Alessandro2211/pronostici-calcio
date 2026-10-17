# Prova a ritroso: cosa migliora i pronostici

Partite lette: I1 2223:380, I1 2324:380, I1 2425:380, I1 2526:380, I1 2627:60, E0 2223:380, E0 2324:380, E0 2425:380, E0 2526:380, E0 2627:60, SP1 2223:380, SP1 2324:380, SP1 2425:380, SP1 2526:380, SP1 2627:78, D1 2223:306, D1 2324:306, D1 2425:306, D1 2526:306, D1 2627:45, F1 2223:380, F1 2324:306, F1 2425:306, F1 2526:306, F1 2627:54, N1 2223:306, N1 2324:306, N1 2425:306, N1 2526:306, N1 2627:72, P1 2223:306, P1 2324:306, P1 2425:306, P1 2526:306, P1 2627:71
Copertura: tiri 100%, tiri in porta 100%, cartellini gialli 100%, xG 4%

## Mescolanza con le quote (log-loss, più basso è meglio)
allenamento 2022-25: w=0.0 0.9705, w=0.2 0.9654, w=0.4 0.9614, w=0.5 0.9597, w=0.6 0.9583, w=0.7 0.9572, w=0.8 0.9563, w=0.9 0.9556, w=1.0 0.9552  (partite con quote: 6360)
allenamento 2022-25 (media geometrica): w=0.3 0.9633, w=0.5 0.9597, w=0.7 0.9571, w=0.8 0.9559
verifica 2025/26-2026/27: w=0.0 0.9925, w=0.2 0.9867, w=0.4 0.9821, w=0.5 0.9802, w=0.6 0.9785, w=0.7 0.9771, w=0.8 0.9760, w=0.9 0.9750, w=1.0 0.9743  (partite con quote: 2266)
verifica 2025/26-2026/27 (media geometrica): w=0.3 0.9845, w=0.5 0.9803, w=0.7 0.9772, w=0.8 0.9755
I1 verifica: modello 0.9923, quote 0.9798, 50/50 0.9833, 70/30 0.9813
E0 verifica: modello 1.0299, quote 1.0236, 50/50 1.0241, 70/30 1.0233
SP1 verifica: modello 0.9843, quote 0.9544, 50/50 0.9655, 70/30 0.9602
D1 verifica: modello 0.9792, quote 0.9591, 50/50 0.9646, 70/30 0.9615
F1 verifica: modello 1.0132, quote 0.9865, 50/50 0.9967, 70/30 0.9919
N1 verifica: modello 1.0110, quote 0.9923, 50/50 0.9983, 70/30 0.9952
P1 verifica: modello 0.9323, quote 0.9181, 50/50 0.9229, 70/30 0.9204