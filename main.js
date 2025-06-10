if (!window.Data) {
    window.Data = {
        systems: [],
        tradeHubs: [],
        connections: []
    };
}

let systemNames = [];
let bookmarkConnections = [];
let eveScoutConnections = [];
const ignoredSystemsData = [];

const initialize = async () => {
    systemNames = Data.systems.map(d => d.name).sort((a, b) => b.length - a.length);
    await loadEveScoutBookmarks();

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
                from: Data.systems.find(o => o.id === b.from),
                to: Data.systems.find(o => o.id === b.to)
            }
        })
        if (bookmarksData.length > 0) {
            showParsedBookmarks(bookmarksData);
        }
        generateRoute();
    });

    editBookmarksButton.addEventListener('click', showBookmarksInput);

    const swapButton = document.getElementById('swap-button');
    const fromInput = document.getElementById('from');
    const toInput = document.getElementById('to');
    swapButton.addEventListener('click', () => {
        const fromValue = fromInput.value;
        fromInput.value = toInput.value;
        toInput.value = fromValue;
    });

    fromInput.addEventListener("keypress", function(event) {
        if (event.key === "Enter") {
            event.preventDefault();
            generateRoute();
        }
    });

    toInput.addEventListener("keypress", function(event) {
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
        const bookName = bookmark[0];
        const fromSystem = bookmark[3];
        const sigRegex = /\b[A-Z]{3}-\d{3}\b/;
        const match = bookName.match(sigRegex);
        const now = Date.now();
        if (match) {
            const sig = match[0];
            const toSystems = systemNames.filter(s => bookName.toLowerCase().includes(s.toLowerCase()));
            let toSystem;
            if (toSystems.length > 1) {
                toSystem = toSystems.find(s => !Data.tradeHubs.find(th => th.toLowerCase() === s.toLowerCase()));
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
                        if (existingConn) {
                            existingConn.sig = sig;
                        } else {
                            bookmarkConnections.push({from: from, to: to, sig: sig, source: 'LSH'});
                        }
                        existingConn = bookmarkConnections.find(conn => from === conn.to && to === conn.from);
                        if (!existingConn) {
                            bookmarkConnections.push({from: to, to: from, sig: "WH (???)", source: 'LSH'});
                        }
                    }
                }
            }
        }
    })
};

function generateRoute() {
    const from = document.getElementById("from").value;
    const to = document.getElementById("to").value;
    const fromId = Data.systems.find(o => o.name.toLowerCase() === from.toLowerCase())?.id;
    const toId = Data.systems.find(o => o.name.toLowerCase() === to.toLowerCase())?.id;

    if (toId && fromId) {
        const plainRoute = findShortestRoute([...Data.connections, ...bookmarkConnections, ...eveScoutConnections], fromId, toId, ignoredSystemsData);
        const routeData = plainRoute.map(routeElem => {
            const system = Data.systems.find(o => o.id === routeElem.id);
            return {
                id: routeElem.id,
                name: system.name,
                security: system.security,
                sig: routeElem.sig,
                source: routeElem.source
            };
        });
        const barsContainer = document.getElementById('bars-container');
        const jumpsLabel = document.getElementById('jumps');
        barsContainer.innerHTML = '';
        const barHeight = 30;
        const barGap = 4;
        jumpsLabel.innerText = `Jumps: ${routeData.length > 0 ? routeData.length - 1 : 0}`;

        routeData.forEach((system, index) => {
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

                if (system.source) {
                    const sourceText = document.createElement('div');
                    sourceText.className = 'source-text';
                    sourceText.textContent = `(${system.source})`;
                    label.appendChild(sourceText);
                }

                const yPos = (index * barHeight) + (index * barGap) + barHeight + (barGap / 2);
                label.style.top = `${yPos}px`;

                barsContainer.appendChild(label);
            }
        });
    }
};

const ignoreSystem = (id) => {
    const ignoredSystem = Data.systems.find(s => s.id === id);
    ignoredSystemsData.push(ignoredSystem);
    generateRoute();
    updateIgnoredSystems();
};

const unIgnoreSystem = (id) => {
    const ignoredSystemIndex = ignoredSystemsData.findIndex(s => s.id === id);
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
        respJson.forEach(sig => {
            if (sig.remaining_hours > 0) {
                let existingConn = eveScoutConnections.find(conn => sig.in_system_id === conn.from && sig.out_system_id === conn.to);
                if (existingConn) {
                    existingConn.sig = sig.in_signature;
                } else {
                    eveScoutConnections.push({
                        from: sig.in_system_id,
                        to: sig.out_system_id,
                        sig: sig.in_signature,
                        source: 'EVE Scout'
                    });
                }
                existingConn = eveScoutConnections.find(conn => sig.in_system_id === conn.to && sig.out_system_id === conn.from);
                if (!existingConn) {
                    eveScoutConnections.push({
                        from: sig.out_system_id,
                        to: sig.in_system_id,
                        sig: 'WH (???)',
                        source: 'EVE Scout'
                    });
                }
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

const findShortestRoute = (conns, from, to, ignored) => {
    const graph = {};
    for (const edge of conns) {
        const {from, to, sig, source} = edge;
        const isIgnored = !!ignoredSystemsData.find(s => s.id === from || s.id === to);
        if (!isIgnored) {
            if (!graph[from]) {
                graph[from] = [];
            }
            graph[from].push({id: to, sig: sig, source: source});
        }
    }
    const queue = [[{id: from}]];
    const visited = new Set();
    while (queue.length > 0) {
        const path = queue.shift();
        const lastPathObject = path[path.length - 1];
        const currentNodeId = lastPathObject.id;
        if (currentNodeId === to) {
            return path;
        }
        if (!visited.has(currentNodeId)) {
            visited.add(currentNodeId);
            const neighbors = graph[currentNodeId] || [];

            for (const neighbor of neighbors) {
                if (!visited.has(neighbor.id)) {
                    const newPath = path.slice(0, -1);
                    const lastNodeWithSig = {...lastPathObject, sig: neighbor.sig, source: neighbor.source};
                    newPath.push(lastNodeWithSig);
                    newPath.push({id: neighbor.id});
                    queue.push(newPath);
                }
            }
        }
    }

    return [];
};