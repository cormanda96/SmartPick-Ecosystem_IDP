// dispense.js
let activeProposalId = null;

function renderDispenseTables() {
    const approvedBody = document.getElementById('approved-proposals-body');
    const readyBody = document.getElementById('collection-ready-body');

    // Filter 1: Approved by Supervisor, but Store hasn't finished
    const approved = proposalRegistry.filter(p => p.supervisorStatus === "Approved" && p.storeStatus === "Waiting");
    approvedBody.innerHTML = approved.map(p => `
        <tr>
            <td>${p.student}</td>
            <td>${p.project}</td>
            <td>${p.items.length} items</td>
            <td><button onclick="openProposal('${p.id}')" class="btn-role" style="padding:5px 10px;">OPEN</button></td>
        </tr>
    `).join('');

    // Filter 2: Store marked "Done", waiting for student pickup
    const ready = proposalRegistry.filter(p => p.storeStatus === "Done");
    readyBody.innerHTML = ready.map(p => `
        <tr>
            <td>${p.student}</td>
            <td><span class="code-tag">${p.bagCode}</span></td>
            <td><span class="status-badge badge-approved">READY</span></td>
            <td><button onclick="markCollected('${p.id}')" class="btn-role" style="background:#333; color:white; border:none;">COLLECTED</button></td>
        </tr>
    `).join('');
}

function openProposal(id) {
    activeProposalId = id;
    const p = proposalRegistry.find(item => item.id === id);
    document.getElementById('modal-student-name').innerText = p.student;
    
    const listBody = document.getElementById('modal-item-list');
    listBody.innerHTML = p.items.map(itemName => {
        // Find stock and simulate Rack Code
        const stockItem = componentsData.find(c => c.name === itemName);
        const rackCode = stockItem ? "RACK-" + itemName.charAt(0).toUpperCase() + "1" : "N/A";
        
        return `
            <tr>
                <td>${itemName}</td>
                <td>1</td>
                <td><span style="color:#ff9800; font-weight:600;">${rackCode}</span></td>
                <td><button onclick="sendToESP32('${rackCode}')" class="rack-btn">SEARCH</button></td>
            </tr>
        `;
    }).join('');

    document.getElementById('proposal-modal').style.display = 'block';
    
    // Set up the DONE button
    document.getElementById('done-btn').onclick = () => finalizePacking(id);
}

function sendToESP32(code) {
    // Simulation of Supabase signal
    console.log(`SIGNAL SENT TO SUPABASE: ESP32 high-light Rack ${code}`);
    alert(`Signal sent to Rack ${code}. LED should be blinking.`);
}

function finalizePacking(id) {
    const p = proposalRegistry.find(item => item.id === id);
    let allInStock = true;

    // 1. Check stock and deduct
    p.items.forEach(itemName => {
        const stockItem = componentsData.find(c => c.name === itemName);
        if (!stockItem || stockItem.qty <= 0) {
            allInStock = false;
        } else {
            stockItem.qty -= 1; // Deduct stock
        }
    });

    if (!allInStock) {
        p.supervisorStatus = "Declined";
        p.feedback = "AUTO-REJECT: Some components went out of stock during processing.";
        alert("STOCK DEPLETED: Proposal automatically rejected and student notified.");
    } else {
        p.storeStatus = "Done";
        p.bagCode = "BAG-" + Math.floor(1000 + Math.random() * 9000);
        alert(`Success! Bag Generated: ${p.bagCode}`);
    }

    closeModal();
    renderDispenseTables();
}

function markCollected(id) {
    // Final step: Remove from active list and it remains in History
    const index = proposalRegistry.findIndex(p => p.id === id);
    // In a real app, you'd mark a flag like 'archived: true'
    proposalRegistry[index].storeStatus = "Collected"; 
    renderDispenseTables();
    alert("Hand-over complete. Transaction saved to history.");
}

function closeModal() { document.getElementById('proposal-modal').style.display = 'none'; }

window.addEventListener('DOMContentLoaded', renderDispenseTables);