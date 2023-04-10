import networkx as nx
import osmnx as ox
import pyomo.environ as pyo
import matplotlib.pyplot as plt
import numpy as np
import sys

ox.config(use_cache=True, log_console=False)

# download street network data from OSM and construct a MultiGraph model
G = ox.graph_from_point((float(sys.argv[1]), float(sys.argv[2])), dist=2200, network_type="drive")
G = ox.distance.add_edge_lengths(G)
G = ox.utils_graph.get_undirected(G)

# fig, ax = ox.plot_graph(G)

n = G.number_of_nodes()
# print('number of nodes: ', n)
# inf = 1000000000001
# adj_matrix = [[inf for j in range(n)] for i in range(n)]
# for i in range(n): adj_matrix[i][i] = 0

# node_index = {}
# # iterate all nodes
# cnt = 0
for node, node_attr in G.nodes(data=True):
    #     node_index[node] = cnt
    #     cnt += 1
    # print(node, node_attr)
    print(node_attr['x'], node_attr['y'])
# # print(node_index)
# # print(type(G))

# edge_lengths = nx.get_edge_attributes(G, 'length')
# for e, l in edge_lengths.items():
#     # print(e[0], e[1], l)
#     u = node_index[e[0]]
#     v = node_index[e[1]]
#     adj_matrix[u][v] = min([adj_matrix[u][v], l])
#     adj_matrix[v][u] = min([adj_matrix[v][u], l])

# # print(adj_matrix)
