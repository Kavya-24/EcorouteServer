import networkx as nx
import osmnx as ox
import pyomo.environ as pyo
import matplotlib.pyplot as plt
import numpy as np 
import sys 

ox.config(use_cache=True, log_console=True)

# download street network data from OSM and construct a MultiGraph model
G = ox.graph_from_point((float(sys.argv[1]), float(sys.argv[2])), dist=int(sys.argv[3]), network_type="drive")
G = ox.distance.add_edge_lengths(G)
G = ox.utils_graph.get_undirected(G)

# fig, ax = ox.plot_graph(G)

n = G.number_of_nodes()
print('number of nodes', n)
inf = 1000000000001
adj_matrix = [[inf for j in range(n)] for i in range(n)]
for i in range(n): adj_matrix[i][i] = 0

node_index = {}
node_index1 = {}
# iterate all nodes 
cnt = 0
for node, node_attr in G.nodes(data=True):
    node_index[node] = cnt
    node_index1[cnt] = node
    cnt += 1
    # print(node, node_attr)
# print(node_index)
# print(type(G))

edge_lengths = nx.get_edge_attributes(G, 'length')
for e, l in edge_lengths.items():
    # print(e[0], e[1], l)
    u = node_index[e[0]]
    v = node_index[e[1]]
    adj_matrix[u][v] = min([adj_matrix[u][v], l])
    adj_matrix[v][u] = min([adj_matrix[v][u], l])

# print(adj_matrix)

# get each node's weight based on the user data 
node_weights = [100, 40, 8, 200, 5, 10, 21, 14, 10, 8, 7, 60, 500, 4, 300, 20, 10, 10, 10, 31, 10, 10, 10, 10, 100]
x = max(0, n-25)
for i in range(x):
    node_weights.append(50)

dis = [[inf for i in range(n)] for j in range(n)]
parent = [[-1 for i in range(n)] for j in range(n)]

# initializing dis matrix
for i in range(n):
    for j in range(n):
        if i == j:
            dis[i][j] = 0
        elif adj_matrix[i][j] > 0:
            dis[i][j] = dis[j][i] = adj_matrix[i][j]


# floyd warshall's algorithm for shortest distance between each pair of nodes
for k in range(n):
    for i in range(n):
        for j in range(n):
            if dis[i][k] + dis[k][j] < dis[i][j]:
                parent[i][j] = k
                dis[i][j] = dis[i][k] + dis[k][j]

# print('dis matrix', dis)

def find_path(i, j, parent):
    if parent[i][j] == -1:
        return ""
    return find_path(i, parent[i][j], parent) + " " + str(parent[i][j]) + " " + find_path(parent[i][j], j, parent)

# list of shortest paths between all unordered pairs of origin-destination
paths = []
for i in range(n):
    for j in range(i+1, n):
        p = find_path(i, j, parent).split()
        p = [int(x) for x in p]
        p.insert(0, i)
        p.append(j)
        paths.append(p)

# print('paths', paths)

# returns a space-separated string with intermediate nodes on shortest path between i to j
def place_charging_stations(adj_matrix, node_weights, vehicle_range, number_of_CS_p):

    h = []   # global list of facility combinations that can refuel some path
    # list of tuples (path_index, h_index) s.t. given path can be refueled by given h
    path_h = []
    # list of tuples (facility combination, facility) s.t. given fac is in fac comb
    facility_h = []

    def can_facilities_refuel_path(path, facilities, vehicle_range):
        f = set(facilities)
        remaining_fuel_range = 0

        # have to consider roundtrip so adding reverse path as well to path
        p_rev = []
        l = len(path)
        for i in range(l-2, -1, -1):
            p_rev.append(path[i])

        # now path becomes roundtrip path from orgin->destination->origin
        path1 = []
        for i in path: path1.append(i)
        for i in p_rev: path1.append(i)

        # path.extend(p_rev) # this line was giving error as pass by reference happens in python, any change is reflected back 
        # print(path)

        if path1[0] in f:
            # if origin has station, start with full charge
            remaining_fuel_range = vehicle_range
        else:
            # if not, start with atleast half charge
            remaining_fuel_range = 0.5 * vehicle_range

        for i in range(1, len(path1)):  # here path is roundtrip path
            remaining_fuel_range -= adj_matrix[path1[i]][path1[i-1]]
            if remaining_fuel_range < 0:  # if rem fuel is negative, it means vehicle could not complete the journey
                return False
            # if station built at destination, vehicle could complete roundtrip as well
            elif i == l-1 and path1[i] in f:
                return True
            elif i == len(path1)-1:  # reached origin after roundtrip
                return True
            elif path1[i] in f:  # if station at current node, vehicle fully charged
                remaining_fuel_range = vehicle_range

    # vehicle_range = 7

    # for each path, find list of node combinations that can refuel that path
    for index_p, p in enumerate(paths):
        # print('index_p, p', index_p, p)
        l = len(p)
        prc = []    # possible refueling combinations of facility nodes that refuel path p
        for i in range(1, 2**l):    # all combinations of nodes for path p
            ph = []
            for j in range(l):
                if (1 << j) & i:
                    ph.append(p[j])
            if can_facilities_refuel_path(p, ph, vehicle_range):
                ph.append(i)  # for binary rep
                prc.append(ph)

        # remove any combination which is a superset of some other combination
        superset = [0] * len(prc)
        for i in range(len(prc)):
            for j in range(len(prc)):
                if i != j and (prc[i][-1] & prc[j][-1]) == prc[j][-1]:
                    superset[i] = 1

        for i in range(len(prc)):
            if not superset[i]:
                # remove last element which was binary rep of combination
                prc[i].pop(-1)
                index_h = -1
                if prc[i] in h:
                    index_h = h.index(prc[i])
                else:
                    h.append(prc[i])
                    index_h = len(h)-1
                # adding (path, facility_combination) indices tuple to show that path index_p can be refuelled by facility_combination index_h
                path_h.append((index_p, index_h))
                for j in prc[i]:
                    # facility combination h has facility j in it
                    facility_h.append((index_h, j))
    # print('h', h)
    bqh = [[0 for i in range(len(h))] for j in range(len(paths))]
    ahk = [[0 for i in range(n)] for j in range(len(h))]
   
    for i in path_h:
        bqh[i[0]][i[1]] = 1
    for i in facility_h:
        ahk[i[0]][i[1]] = 1
    # print('bqh', bqh)
    # print('ahk', ahk)

    # print(can_facilities_refuel_path([0, 1, 2], [0, 1], 7))

    # node_weights = [100, 40, 8, 200, 5, 10, 21, 14, 10, 8, 7, 60, 500, 4, 300, 20, 10, 10, 10, 31, 10, 10, 10, 10, 100]

    # number_of_CS_p = 2 # test for range from 1 to 25

    model = pyo.ConcreteModel()

    # RangeSet(), Var(), Param(), Objective(), Constraint()

    # creating indices for paths, possible facility combinations, nodes or facility locations
    model.Q = pyo.RangeSet(len(paths))
    model.H = pyo.RangeSet(len(h))
    model.K = pyo.RangeSet(n)

    # decision variables
    model.y = pyo.Var(model.Q, within=pyo.Binary)
    model.v = pyo.Var(model.H, within=pyo.Binary)
    model.x = pyo.Var(model.K, within=pyo.Binary)

    # parameters given to the model, bqh, ahk, fq
    model.b = pyo.Param(model.Q, model.H, initialize=lambda model, i, j: bqh[i-1][j-1])
    model.a = pyo.Param(model.H, model.K, initialize=lambda model, i, j: ahk[i-1][j-1])
    # for q in range(len(paths)):
    #     print(paths)
    #     print(dis)
    #     print(q,  (node_weights[paths[q][0]]*node_weights[paths[q][-1]])/dis[paths[q][0]][paths[q][-1]])
    model.f = pyo.Param(model.Q, initialize=lambda model, i: node_weights[paths[i-1][0]]*node_weights[paths[i-1][-1]]/dis[paths[i-1][0]][paths[i-1][-1]])

    def objective_function(model):
        return sum(model.y[q] * model.f[q] for q in model.Q)
    
    model.objective = pyo.Objective(rule=objective_function, sense=pyo.maximize)


    # constraints, numbering according to paper
    def constraint_6(model, q):
        return sum(model.b[q, h] * model.v[h] for h in model.H) >= model.y[q]
    
    model.rule1 = pyo.Constraint(model.Q, rule = constraint_6)

    def constraint_7(model, h, k):
        if model.a[h, k] == 1:
            return model.a[h, k] * model.x[k] >= model.v[h] 
        else:
            return pyo.Constraint.Skip

    model.rule2 = pyo.Constraint(model.H, model.K, rule = constraint_7)

    def constraint_8(model): 
        return sum(model.x[k] for k in model.K) == number_of_CS_p
    
    model.rule3 = pyo.Constraint(rule = constraint_8)

    # model.pprint() 

    solver = pyo.SolverFactory('gurobi')
    result = solver.solve(model, tee=True)
    # print(result)

    # print('list of stations')
    List = list(model.x.keys())
    # color_values = [0 for i in range(n)]
    for i in List:
        if model.x[i]() == 1:
            # print(i,'--', model.x[i]())
            print(G.nodes[node_index1[i]]['x'], G.nodes[node_index1[i]]['y'])


    cnt_of_paths_refueled = 0
    total_flow_refueled = 0
    total_flow = 0
    for p in paths:
        total_flow += node_weights[p[0]]*node_weights[p[-1]]/dis[p[0]][p[-1]]

    # print('list of paths refueled')
    List = list(model.y.keys())
    for i in List:
        if model.y[i]() != 0:
            cnt_of_paths_refueled += 1
            total_flow_refueled += node_weights[paths[i-1][0]]*node_weights[paths[i-1][-1]]/dis[paths[i-1][0]][paths[i-1][-1]]
            # print(i,'--', model.y[i]())
    
    return (cnt_of_paths_refueled/len(paths)*100, total_flow_refueled/total_flow*100)


def main():
    ans = place_charging_stations(adj_matrix, node_weights, int(sys.argv[4]), int(sys.argv[5]))
    # print(ans)
    # vehicle_ranges = [400, 800, 1200]
    # percentage_paths_refueled = [[0 for j in range(n)] for i in range(3)]
    # percentage_flow_refueled = [[0 for j in range(n)] for i in range(3)]
    # for i in range(n):
    #     ncs = i + 1
    #     for j in range(3):
    #         vr = vehicle_ranges[j]
    #         print('\n\n\n\n\n--------------------------------------------------------')
    #         print('Vehicle Range = ', vr, ', Number of charging stations to be placed = ', ncs)
    #         print('--------------------------------------------------------')
    #         ans = place_charging_stations(adj_matrix, node_weights, vr, ncs)
    #         percentage_paths_refueled[j][i] = ans[0]
    #         percentage_flow_refueled[j][i] = ans[1]


    # xx = [i for i in range(1, n+1)]
    # xpoints = np.array(xx)
    # # plt.subplot(1, 2, 1)
    # plt.plot(xpoints, np.array(percentage_paths_refueled[0]), label = 'range='+str(vehicle_ranges[0]))
    # plt.plot(xpoints, np.array(percentage_paths_refueled[1]), label = 'range='+str(vehicle_ranges[1]))
    # plt.plot(xpoints, np.array(percentage_paths_refueled[2]), label = 'range='+str(vehicle_ranges[2]))
    # plt.xticks(range(2, n+1, 2))
    # plt.grid()
    # plt.legend()
    # plt.xlabel('Number of charging stations placed')
    # plt.ylabel('Percentage of paths refueled')
    # plt.show()

    # # plt.subplot(1, 2, 2)
    # plt.plot(xpoints, np.array(percentage_flow_refueled[0]), label = 'range='+str(vehicle_ranges[0]))
    # plt.plot(xpoints, np.array(percentage_flow_refueled[1]), label = 'range='+str(vehicle_ranges[1]))
    # plt.plot(xpoints, np.array(percentage_flow_refueled[2]), label = 'range='+str(vehicle_ranges[2]))
    # plt.xticks(range(2, n+1, 2))
    # plt.grid()
    # plt.legend()
    # plt.xlabel('Number of charging stations placed')
    # plt.ylabel('Percentage of flow refueled')
    # plt.show()


main()

