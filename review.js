let currentSelectedProposalId = null; 

function initializeReviewPage() {
    renderMasterStudentList();
}

// 1. Render the left sidebar with all "Pending" proposals
function renderMasterStudentList() {
    const listContainer = document.getElementById('master-student-list');
    const pendingCount = document.getElementById('pending-count');
    if (!listContainer) return;

    // Filter registry for only PENDING items
    const pendingProposals = proposalRegistry.filter(p => p.supervisorStatus === "Pending");
    pendingCount.innerText = pendingProposals.length;

    listContainer.innerHTML = ""; 

    if (pendingProposals.length === 0) {
        listContainer.innerHTML = "<p style='color: #888; font-size: 0.9rem; text-align: center;'>No proposals pending.</p>";
        return; 
    }

    pendingProposals.forEach(prop => {
        const item = document.createElement('div');
        item.className = `student-item ${currentSelectedProposalId === prop.id ? 'active' : ''}`;
        item.onclick = () => loadProposalDetails(prop.id); // Triggers the detail load
        item.innerHTML = `
            <p style="margin: 0; font-weight: 600;">${prop.student}</p>
            <small>${prop.project} | ${prop.items.length} Items</small>
        `;
        listContainer.appendChild(item);
    });
}

// 2. Load the specific proposal data into the right panel
function loadProposalDetails(proposalId) {
    currentSelectedProposalId = proposalId;
    const prop = proposalRegistry.find(p => p.id === proposalId);
    if (!prop) return;

    // Refresh Master List to update the "active" highlight
    renderMasterStudentList();

    // Update Detail UI
    document.getElementById('current-student-name').innerText = prop.student;
    document.getElementById('current-proposal-id').innerText = prop.id;
    document.getElementById('diagram-preview').src = prop.diagramUrl;

    // Clear and Popluate the Component Table
    const tableBody = document.getElementById('component-table-body');
    tableBody.innerHTML = "";
    prop.items.forEach(item => {
        tableBody.innerHTML += `
            <tr>
                <td>${item}</td>
                <td>1</td>
                <td><span class="status-badge badge-approved" style="font-size: 0.7rem;">Verified</span></td>
            </tr>
        `;
    });
}

// 3. Handle Decision Logic (Approve/Decline + Feedback)
function handleDecision(decision) {
    if (!currentSelectedProposalId) return;

    const feedback = document.getElementById('feedback-comment').value;

    // Verification: If declining, feedback is required
    if (decision === 'Declined' && feedback.trim() === "") {
        alert("Please provide feedback or a reason for declination.");
        return; 
    }

    // Update the "database" object
    const proposal = proposalRegistry.find(p => p.id === currentSelectedProposalId);
    if (proposal) {
        proposal.supervisorStatus = decision; 
        proposal.feedback = feedback; // Save the comment
        
        // Final Action: Clear current view and refresh
        currentSelectedProposalId = null; 
        document.getElementById('feedback-comment').value = ""; // Clear input
        initializeReviewPage(); // Refresh the list
        alert(`Proposal for ${proposal.student} has been ${decision}.`);
    }
}

// Start the page logic
window.addEventListener('DOMContentLoaded', initializeReviewPage);