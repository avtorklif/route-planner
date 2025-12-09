if (!window.Data) {
    window.Data = {
        systems: [],
        tradeHubs: [],
        connections: []
    };
}

let systemNames = [];
let regionNames = [];
let bookmarkConnections = [];
let eveScoutConnections = [];
const ignoredSystemsData = [];
let preferSafer = false;
let systemsDict = {};

const initialize = async () => {
    systemNames = Data.systems.map(d => d.name).sort((a, b) => b.length - a.length);
    systemsDict = Data.systems.reduce((acc, obj) => {
        acc[obj.id] = obj;
        return acc;
    }, {});
    regionNames = Data.regions.map(d => d.name);
    await loadEveScoutBookmarks();
    const fromInput = document.getElementById('from');
    const toInput = document.getElementById('to');
    const awesompleteFromConfig = {
        list: systemNames,
        maxItems: 3,
        filter: (text, input) => {
            return text.toLowerCase().startsWith(input.toLowerCase());
        }
    };
    const awesompleteToConfig = {
        list: [...systemNames, ...regionNames],
        maxItems: 3,
        filter: (text, input) => {
            return text.toLowerCase().startsWith(input.toLowerCase());
        }
    };
    const fromAwesomplete = new Awesomplete(fromInput, awesompleteFromConfig);
    const toAwesomplete = new Awesomplete(toInput, awesompleteToConfig);

    document.querySelectorAll('input[name="preference"]').forEach((elem) => {
        elem.addEventListener("change", (event) => {
            preferSafer = event.target.value === 'safer';
            generateRoute();
        });
    });

    document.getElementById('aridia-safe')?.addEventListener('change', generateRoute);

    fromInput.addEventListener('keydown', (event) => {
        if (event.key === 'Tab' && fromAwesomplete.opened && fromAwesomplete.ul.children.length > 0) {
            event.preventDefault();
            fromAwesomplete.goto(0);
            fromAwesomplete.select();
        }
    });

    toInput.addEventListener('keydown', (event) => {
        if (event.key === 'Tab' && toAwesomplete.opened && toAwesomplete.ul.children.length > 0) {
            event.preventDefault();
            toAwesomplete.goto(0);
            toAwesomplete.select();
        }
    });

    const buildButton = document.getElementById('build-route');
    buildButton.addEventListener('click', generateRoute);
    const submitBookmarksButton = document.getElementById('submit-bookmarks');
    const editBookmarksButton = document.getElementById('edit-bookmarks');
    submitBookmarksButton.addEventListener('click', () => {
        const bookmarksText = document.getElementById('bookmarks-input').value;
        parseBookmarks(bookmarksText);
        const bookmarksData = bookmarkConnections.map(b => {
            return {
                sig: b.sig,
                from: systemsDict[b.from],
                to: systemsDict[b.to]
            }
        })
        if (bookmarksData.length > 0) {
            showParsedBookmarks(bookmarksData);
        }
        generateRoute();
    });

    editBookmarksButton.addEventListener('click', showBookmarksInput);

    const swapButton = document.getElementById('swap-button');
    swapButton.addEventListener('click', () => {
        const fromValue = fromInput.value;
        fromInput.value = toInput.value;
        toInput.value = fromValue;
        generateRoute();
    });

    fromInput.addEventListener("keypress", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            generateRoute();
        }
    });

    toInput.addEventListener("keypress", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            generateRoute();
        }
    });

    updateIgnoredSystems();
};

const updateIgnoredSystems = () => {
    const ignoredSystemsSection = document.getElementById('ignored-systems-section');
    if (ignoredSystemsData.length === 0) {
        ignoredSystemsSection.style.display = 'none';
    } else {
        ignoredSystemsSection.style.display = 'block';
        const ignoredSystemsContainer = document.getElementById('ignored-systems-container');
        ignoredSystemsContainer.innerHTML = '';
        ignoredSystemsData.forEach(system => {
            const tag = document.createElement('div');
            tag.className = 'ignored-system-tag';
            tag.style.backgroundColor = getSecurityColor(system.security);
            tag.textContent = `${system.name} (${roundSystemSecurity(system.security)})`;
            const removeIcon = document.createElement('img');
            removeIcon.className = 'remove-icon';
            removeIcon.src = 'cross.png';
            removeIcon.addEventListener('click', () => unIgnoreSystem(system.id));
            tag.prepend(removeIcon);

            const sec = roundSystemSecurity(system.security);
            if (sec >= 0.5 && sec <= 0.8) {
                tag.style.color = 'black';
                tag.style.textShadow = 'none';
            } else {
                tag.style.color = 'white';
                tag.style.textShadow = '0 1px 2px rgba(0,0,0,0.5)';
            }

            ignoredSystemsContainer.appendChild(tag);
        });
    }
};

const getSecurityColor = (security) => {
    const sec = roundSystemSecurity(security);
    if (sec >= 1.0) return '#2e74dd';
    if (sec >= 0.9) return '#369df6';
    if (sec >= 0.8) return '#4acff1';
    if (sec >= 0.7) return '#60dba6';
    if (sec >= 0.6) return '#72e352';
    if (sec >= 0.5) return '#eeff86';
    if (sec >= 0.4) return '#dc6c08';
    if (sec >= 0.3) return '#cc4711';
    if (sec >= 0.2) return '#bc1212';
    if (sec >= 0.1) return '#6c2220';
    return '#8d3166';
};

const parseBookmarks = (input) => {
    bookmarkConnections = [];
    input.split('\n').map((line) => line.split('\t')).forEach(bookmark => {
        const bookName = bookmark[0].replace("*", "").replace(",", " ");
        const fromSystem = bookmark[3]?.replace("*", "");
        const sigRegex = /\b[A-Z]{3}-\d{3}\b/;
        const match = bookName.match(sigRegex);
        const now = Date.now();
        if (match) {
            const sig = match[0];
            let toSystems = systemNames.filter(s => bookName.split(/\s+/).includes(s));
            if (toSystems.length === 0) {
                toSystems = systemNames.filter(s => bookName.toLowerCase().split(/\s+/).includes(s.toLowerCase()));
            }
            if (toSystems.length === 0) {
                toSystems = systemNames.filter(s => bookName.toLowerCase().includes(s.toLowerCase()));
            }
            let toSystem;
            toSystems = toSystems.filter(s => bookName.indexOf(sig) !== bookName.toLowerCase().indexOf(s.toLowerCase()))
            if (toSystems.length > 1) {
                toSystem = toSystems.find(s => !Data.tradeHubs.find(th => th.toLowerCase() === s.toLowerCase()) && bookName.indexOf(sig) !== bookName.toLowerCase().indexOf(s.toLowerCase()));
            } else if (toSystems.length === 1) {
                toSystem = toSystems[0];
            }
            const creationDate = Date.parse(bookmark[6].replace(/\./g, '-').replace(' ', 'T') + ':00Z');
            if ((now - creationDate) > (24 * 60 * 60 * 1000)) {
                console.log(`Skipping old bookmark sig ${sig}`);
            } else {
                if (toSystem) {
                    const from = Data.systems.find(o => o.name.toLowerCase() === fromSystem.toLowerCase())?.id;
                    const to = Data.systems.find(o => o.name.toLowerCase() === toSystem.toLowerCase())?.id;
                    if (from && to) {
                        let existingConn = bookmarkConnections.find(conn => from === conn.from && to === conn.to);
                        const age = (now - creationDate) / 1000 / 60;
                        if (existingConn) {
                            existingConn.sig = sig;
                        } else {
                            bookmarkConnections.push({from: from, to: to, sig: sig, source: 'LSH', age: age});
                        }
                        existingConn = bookmarkConnections.find(conn => from === conn.to && to === conn.from);
                        if (!existingConn) {
                            bookmarkConnections.push({from: to, to: from, sig: "WH", source: 'LSH', age: age});
                        }
                    }
                }
            }
        }
    })
};


const generateRoute = () => {
    const from = document.getElementById("from").value;
    const to = document.getElementById("to").value;
    const fromId = Data.systems.find(o => o.name.toLowerCase() === from.toLowerCase())?.id;
    let toId = Data.systems.find(o => o.name.toLowerCase() === to.toLowerCase())?.id;
    let isToRegion = false;
    const isAridiaSafe = document.getElementById('aridia-safe')?.checked || false;

    if (!toId) {
        toId = Data.regions.find(o => o.name.toLowerCase() === to.toLowerCase())?.id;
        isToRegion = true;
    }

    if (toId && fromId) {
        let allConnections = [...Data.connections, ...bookmarkConnections, ...eveScoutConnections].map(c => {
            return {...c, from: systemsDict[c.from], to: systemsDict[c.to]}
        })
        let route = [];
        if (!isToRegion) {
            route = findShortestRoute(allConnections, fromId, [toId], ignoredSystemsData, preferSafer, isAridiaSafe);
        } else {
            const regionSystemIds = Data.systems.filter(s => s.region.id === toId).map(s => s.id);
            route = findShortestRoute(allConnections, fromId, regionSystemIds, ignoredSystemsData, preferSafer, isAridiaSafe);
        }
        const barsContainer = document.getElementById('bars-container');
        const jumpsLabel = document.getElementById('jumps');
        barsContainer.innerHTML = '';
        const barHeight = 30;
        const barGap = 4;
        jumpsLabel.innerText = `Jumps: ${route.length > 0 ? route.length - 1 : 0}`;

        route.forEach((system, index) => {
            const bar = document.createElement('div');
            bar.className = 'bar';
            bar.style.backgroundColor = getSecurityColor(system.security);

            const removeIcon = document.createElement('img');
            removeIcon.className = 'remove-icon';
            removeIcon.src = 'cross.png';
            removeIcon.addEventListener('click', () => ignoreSystem(system.id));

            const barText = document.createElement('span');
            barText.textContent = `${system.name} (${roundSystemSecurity(system.security)})`;

            bar.appendChild(removeIcon);
            bar.appendChild(barText);

            const sec = roundSystemSecurity(system.security);
            if (sec >= 0.5 && sec <= 0.8) {
                bar.style.color = 'black';
                bar.style.textShadow = 'none';
            } else {
                bar.style.color = 'white';
                bar.style.textShadow = '0 1px 2px rgba(0,0,0,0.5)';
            }
            barsContainer.appendChild(bar);

            if (system.sig) {
                const label = document.createElement('div');
                label.className = 'bar-label';

                const sigText = document.createElement('div');
                sigText.textContent = system.sig;
                label.appendChild(sigText);

                if (system.age) {
                    const ageText = document.createElement('div');
                    ageText.className = 'source-text';
                    ageText.textContent = `${formatAge(system.age)}`;
                    label.appendChild(ageText);
                }

                const yPos = (index * barHeight) + (index * barGap) + barHeight + (barGap / 2);
                label.style.top = `${yPos}px`;

                barsContainer.appendChild(label);
            }
        });

        let regionGroups = [];
        if (route.length > 0) {
            let currentGroup = [route[0]];
            for (let i = 1; i < route.length; i++) {
                if (route[i].region.id === currentGroup[0].region.id) {
                    currentGroup.push(route[i]);
                } else {
                    regionGroups.push(currentGroup);
                    currentGroup = [route[i]];
                }
            }
            regionGroups.push(currentGroup);
        }
        let currentBarIndex = 0;
        regionGroups.forEach(group => {
            const groupSize = group.length;
            const topPosition = Math.round(currentBarIndex * (barHeight + barGap));
            const groupHeight = (groupSize * barHeight) + ((groupSize - 1) * barGap);

            const visualContainer = document.createElement('div');
            visualContainer.className = 'region-visual-container';
            visualContainer.style.top = `${topPosition}px`;
            visualContainer.style.height = `${groupHeight}px`;

            const regionName = document.createElement('div');
            regionName.className = 'region-name';
            regionName.textContent = group[0].region.name;

            const bracket = document.createElement('div');
            bracket.className = 'region-bracket';

            visualContainer.appendChild(regionName);
            visualContainer.appendChild(bracket);

            barsContainer.appendChild(visualContainer);

            currentBarIndex += groupSize;
        });
    }
};

const ignoreSystem = (id) => {
    const ignoredSystem = systemsDict[id];
    ignoredSystemsData.push(ignoredSystem);
    generateRoute();
    updateIgnoredSystems();
};

const unIgnoreSystem = (id) => {
    const ignoredSystemIndex = systemsDict[id];
    ignoredSystemsData.splice(ignoredSystemIndex, 1);
    generateRoute();
    updateIgnoredSystems();
};

const loadEveScoutBookmarks = async () => {
    eveScoutConnections = [];
    let respJson = [];
    const scoutStatusLabel = document.getElementById('status-text');
    let scoutText = "Eve Scout: ";
    try {
        const response = await fetch("https://api.eve-scout.com/v2/public/signatures");
        if (!response.ok) {
            console.error(`Eve Scout response status: ${response.status}`);
            scoutText += "error";
        }
        respJson = await response.json();

        scoutText += "ok";
        const now = Date.now();
        respJson.forEach(sig => {
            if (sig.remaining_hours > 0) {
                eveScoutConnections.push({
                    from: sig.in_system_id,
                    to: sig.out_system_id,
                    sig: sig.in_signature,
                    source: 'EVE Scout',
                    age: (now - Date.parse(sig.created_at)) / 1000 / 60
                });
                eveScoutConnections.push({
                    from: sig.out_system_id,
                    to: sig.in_system_id,
                    sig: sig.out_signature,
                    source: 'EVE Scout',
                    age: (now - Date.parse(sig.created_at)) / 1000 / 60
                });
            } else {
                console.log(`Skipping old Eve Scout sig ${sig.in_signature}`);
            }
        });
    } catch (error) {
        console.error(error.message);
        scoutText += "error";
    }
    scoutStatusLabel.innerText = scoutText;
};

const showParsedBookmarks = (data) => {
    const tableBody = document.querySelector('.signatures-table tbody');
    tableBody.innerHTML = '';

    const bookmarksInputContainer = document.querySelector('.textarea-container');
    const submitBookmarksButton = document.getElementById('submit-bookmarks');
    const tableContainer = document.getElementById('table-container');
    const editBookmarksButton = document.getElementById('edit-bookmarks');

    data.forEach(item => {
        const row = document.createElement('tr');
        const sigCell = document.createElement('td');
        sigCell.textContent = item.sig;
        row.appendChild(sigCell);

        const fromCell = document.createElement('td');
        const fromContent = document.createElement('div');
        fromContent.className = 'cell-content';
        const fromDot = document.createElement('div');
        fromDot.className = 'security-dot';
        fromDot.style.backgroundColor = getSecurityColor(item.from.security);
        const fromText = document.createElement('span');
        fromText.textContent = `${item.from.name} (${roundSystemSecurity(item.from.security)})`;
        fromContent.appendChild(fromDot);
        fromContent.appendChild(fromText);
        fromCell.appendChild(fromContent);
        row.appendChild(fromCell);

        const toCell = document.createElement('td');
        const toContent = document.createElement('div');
        toContent.className = 'cell-content';
        const toDot = document.createElement('div');
        toDot.className = 'security-dot';
        toDot.style.backgroundColor = getSecurityColor(item.to.security);
        const toText = document.createElement('span');
        toText.textContent = `${item.to.name} (${roundSystemSecurity(item.to.security)})`;
        toContent.appendChild(toDot);
        toContent.appendChild(toText);
        toCell.appendChild(toContent);
        row.appendChild(toCell);

        tableBody.appendChild(row);
    });

    bookmarksInputContainer.classList.add('hidden');
    submitBookmarksButton.classList.add('hidden');
    tableContainer.classList.remove('hidden');
    editBookmarksButton.classList.remove('hidden');
};

const showBookmarksInput = () => {
    const bookmarksInputContainer = document.querySelector('.textarea-container');
    const tableContainer = document.getElementById('table-container');
    const submitBookmarksButton = document.getElementById('submit-bookmarks');
    const editBookmarksButton = document.getElementById('edit-bookmarks');

    bookmarksInputContainer.classList.remove('hidden');
    submitBookmarksButton.classList.remove('hidden');
    tableContainer.classList.add('hidden');
    editBookmarksButton.classList.add('hidden');
};

const roundSystemSecurity = (security) => {
    if (security > 0 && security < 0.05) {
        return 0.1;
    } else {
        return security.toFixed(1);
    }
};

const formatAge = (ageMinutes) => `${Math.floor(ageMinutes / 60)}h${Math.floor(ageMinutes % 60)}m`

const findShortestRoute = (conns, fromId, toIds, ignored, preferSafer, isAridiaSafe) => {
    const toIdsSet = new Set(toIds);
    const graph = {};
    const nodeInfo = {};
    for (const edge of conns) {
        const {from: fromObj, to: toObj, ...edgeProps} = edge;
        nodeInfo[fromObj.id] = fromObj;
        nodeInfo[toObj.id] = toObj;
        if (ignored.find(s => s.id === fromObj.id || s.id === toObj.id)) continue;
        if (!graph[fromObj.id]) graph[fromObj.id] = [];
        graph[fromObj.id].push({id: toObj.id, ...edgeProps});
    }
    const safetyWeight = preferSafer ? 1000 : 0.001;
    if (!nodeInfo[fromId]) return [];
    const pq = [{path: [nodeInfo[fromId]], cost: 0}];
    const costs = new Map();
    costs.set(fromId, 0);
    const getNext = () => {
        let bestIndex = 0;
        for (let i = 1; i < pq.length; i++) {
            if (pq[i].cost < pq[bestIndex].cost) bestIndex = i;
        }
        return pq.splice(bestIndex, 1)[0];
    };
    while (pq.length > 0) {
        const {path, cost: currentCost} = getNext();
        const lastPathNode = path[path.length - 1];
        if (currentCost > costs.get(lastPathNode.id)) continue;
        if (toIdsSet.has(lastPathNode.id)) return path;
        const neighbours = graph[lastPathNode.id] || [];
        const isAridia = lastPathNode.region.name === 'Aridia';
        const isDefaultSafe = parseFloat(lastPathNode.security.toFixed(1)) >= 0.5;
        const isCurrentNodeSafe = isDefaultSafe || (isAridiaSafe && isAridia);

        const hopCost = 1 + (isCurrentNodeSafe ? 0 : safetyWeight);
        for (const neighbour of neighbours) {
            const newCost = currentCost + hopCost;
            if (!costs.has(neighbour.id) || newCost < costs.get(neighbour.id)) {
                costs.set(neighbour.id, newCost);
                const {id: neighbourId, ...edgeData} = neighbour;
                const lastNodeWithEdgeData = {...lastPathNode, ...edgeData};
                const newPath = [...path.slice(0, -1), lastNodeWithEdgeData, nodeInfo[neighbourId]];
                pq.push({path: newPath, cost: newCost});
            }
        }
    }
    return [];
};