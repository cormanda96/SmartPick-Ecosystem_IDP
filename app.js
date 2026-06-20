// ============================================================
//  SMARTPICK — app.js (Supabase Edition)
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL  = 'https://dizglrupjeltbhkvhvov.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpemdscnVwamVsdGJoa3Zodm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2Njg2ODAsImV4cCI6MjA5MzI0NDY4MH0.E8gw7xjrKdHiuJ3wYHvxFCqJGUIHP4arkoyRrkbQVcY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)


// ============================================================
//  AUTH — LOGIN
//  Called from login.html form submit
// ============================================================
export async function handleLogin(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
        alert('Login failed: ' + error.message)
        return
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, role, matric_number, supervisor_id, staff_code')
        .eq('id', data.user.id)
        .single()

    if (profileError || !profile) {
        // Last resort: fall back to user_metadata
        const metaRole = data.user.user_metadata?.role
        if (metaRole) {
            localStorage.setItem('userRole', metaRole)
            redirectByRole(metaRole)
            return
        }
        alert('Could not load user profile. Please contact admin.')
        return
    }

    localStorage.setItem('userRole', profile.role)
    redirectByRole(profile.role)
}

function redirectByRole(role) {
    if (role === 'supervisor') {
        window.location.href = 'dashboard2.html'
    } else if (role === 'manager') {
        window.location.href = 'dashboard3.html'
    } else {
        window.location.href = 'dashboard1.html'
    }
}


// ============================================================
//  AUTH — REGISTER
//  Called from register.html form submit
// ============================================================
export async function handleRegister(fullName, email, password, role, matricNumber, supervisorCode) {

    // ── Pre-validate BEFORE creating the auth account ──────
    // This way we never create an orphaned auth user

    if (role === 'supervisor') {
        if (!supervisorCode || supervisorCode.trim() === '') {
            alert('Please create your exclusive auth code before registering.')
            return
        }
        // Check if staff_code is already taken
        const { data: existing } = await supabase
            .from('profiles')
            .select('id')
            .eq('staff_code', supervisorCode.trim())
            .single()
        if (existing) {
            alert('That supervisor auth code is already taken. Please choose a different code.')
            return
        }
    }

    if (role === 'student') {
        if (!supervisorCode || supervisorCode.trim() === '') {
            alert('Supervisor auth code is required. Please ask your supervisor for their code.')
            return
        }
        // Verify the supervisor code exists before proceeding
        const { data: supData } = await supabase
            .from('profiles')
            .select('id')
            .eq('role', 'supervisor')
            .eq('staff_code', supervisorCode.trim())
            .single()
        if (!supData) {
            alert('Invalid supervisor auth code. Please check the code and try again.')
            return
        }
    }

    // ── All validations passed — now create the auth account ──
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: fullName,
                role:      role
            }
        }
    })

    if (error) {
        alert('Registration failed: ' + error.message)
        return
    }

    // Wait briefly for the trigger to create the profiles row
    await new Promise(resolve => setTimeout(resolve, 800))

    // ── Post-signup: save role-specific data to profiles ──
    if (role === 'supervisor' && data.user) {
        const { error: codeError } = await supabase
            .from('profiles')
            .update({ staff_code: supervisorCode.trim() })
            .eq('id', data.user.id)

        if (codeError) {
            alert('Account created but failed to save supervisor code. Contact admin. Error: ' + codeError.message)
            await supabase.auth.signOut()
            return
        }
    }

    if (role === 'student' && data.user) {
        // Re-fetch supervisor id (already validated above)
        const { data: supData } = await supabase
            .from('profiles')
            .select('id')
            .eq('role', 'supervisor')
            .eq('staff_code', supervisorCode.trim())
            .single()

        await supabase
            .from('profiles')
            .update({
                matric_number: matricNumber || null,
                supervisor_id: supData.id
            })
            .eq('id', data.user.id)
    }

    await supabase.auth.signOut()
    alert('Registration successful! Please log in.')
    window.location.href = 'login.html'
}


// ============================================================
//  AUTH — LOGOUT
// ============================================================
export async function logout() {
    await supabase.auth.signOut()
    localStorage.removeItem('userRole')
    window.location.href = 'index.html'
}


// ============================================================
//  AUTH — GET CURRENT USER + PROFILE
// ============================================================
export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

    return { ...user, profile }
}


// ============================================================
//  STORE STATUS — BANNER
//  Reads is_open from store_settings table (single row)
// ============================================================
export async function initializeGlobalBanner() {
    const banner     = document.getElementById('status-banner')
    const statusText = document.getElementById('status-text')
    if (!banner || !statusText) return

    const { data, error } = await supabase
        .from('store_settings')
        .select('is_open')
        .eq('id', 1)
        .single()

    if (error || !data) {
        statusText.innerText = 'UNKNOWN'
        return
    }

    if (data.is_open) {
        banner.style.backgroundColor = 'var(--open-green)'
        statusText.innerText = 'OPEN'
    } else {
        banner.style.backgroundColor = 'var(--closed-red)'
        statusText.innerText = 'CLOSED'
    }
}


// ============================================================
//  STORE STATUS — TOGGLE (Manager only)
// ============================================================
export async function toggleStoreGlobal() {
    // Read current state first
    const { data: current } = await supabase
        .from('store_settings')
        .select('is_open')
        .eq('id', 1)
        .single()

    const newState = !current.is_open

    const { data: { user } } = await supabase.auth.getUser()

    await supabase
        .from('store_settings')
        .update({ is_open: newState, updated_by: user.id, updated_at: new Date() })
        .eq('id', 1)

    // Update UI
    const label = document.getElementById('current-status-label')
    const btn   = document.getElementById('toggle-btn')

    if (label && btn) {
        label.innerText = `Store is currently ${newState ? 'OPEN' : 'CLOSED'}`
        btn.innerText   = newState ? 'CLOSE STORE' : 'OPEN STORE'
        btn.style.backgroundColor = newState ? 'var(--closed-red)' : 'var(--open-green)'
    }

    await initializeGlobalBanner()
}


// ============================================================
//  SIDEBAR — NAVIGATION
// ============================================================
export async function renderGlobalNavigation() {
    const sidebarNav = document.getElementById('side-nav')
    const topNav     = document.getElementById('top-nav-links')

    // Public pages (no sidebar): show Home, Login, Register
    if (!sidebarNav && topNav) {
        topNav.innerHTML = `
            <a href="login.html"    style="color:white; text-decoration:none; margin-left:20px;">Log In</a>
            <a href="register.html" style="color:white; text-decoration:none; margin-left:20px;">Register</a>
        `
        return
    }

    if (!sidebarNav) return

    const role = localStorage.getItem('userRole') || 'student'

    // Fetch user profile for display
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role, matric_number, supervisor_id, staff_code')
        .eq('id', user?.id)
        .single()

    let supervisorName = '—'
    if (profile?.supervisor_id) {
    const { data: supervisorProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', profile.supervisor_id)
            .single()
        supervisorName = supervisorProfile?.full_name || '—'
    }

    const userIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="22" height="22"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>`

    if (topNav) {
        topNav.innerHTML = `
            <div style="position:relative; display:inline-block;">
                <button onclick="toggleProfileDropdown()" 
                    style="width:38px; height:38px; border-radius:50%; background:var(--main-blue); color:white; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                    ${userIcon}
                </button>
                <div id="profile-dropdown" style="display:none; position:absolute; right:0; top:48px; background:white; border-radius:12px; box-shadow:0 4px 20px rgba(0,0,0,0.15); min-width:260px; z-index:9999; padding:0; overflow:hidden;">
                    <div style="background:var(--main-blue); padding:16px 20px; color:white;">
                        <div style="width:48px; height:48px; border-radius:50%; background:rgba(255,255,255,0.3); display:flex; align-items:center; justify-content:center; margin-bottom:10px;">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="30" height="30"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
                        </div>
                        <div style="font-weight:700; font-size:1rem;">${profile?.full_name || '—'}</div>
                        <div style="font-size:0.8rem; opacity:0.85; margin-top:2px;">${user?.email || '—'}</div>
                    </div>
                    <div style="padding:16px 20px;">
                        <div style="font-size:0.85rem; color:#555; margin-bottom:8px;">
                            <span style="color:#999;">Role:</span> <strong style="text-transform:capitalize;">${profile?.role || role}</strong>
                        </div>
                        ${role === 'student' ? `
                        <div style="font-size:0.85rem; color:#555; margin-bottom:8px;">
                            <span style="color:#999;">Matric No:</span> <strong>${profile?.matric_number || '—'}</strong>
                        </div>` : ''}
                        ${role === 'student' ? `
                        <div style="font-size:0.85rem; color:#555; margin-bottom:8px;">
                            <span style="color:#999;">Supervisor name:</span> <strong>${supervisorName}</strong>
                        </div>` : ''}
                        ${role === 'supervisor' || role === 'manager' ? `
                        <div style="font-size:0.85rem; color:#555; margin-bottom:8px;">
                            <span style="color:#999;">Staff Code:</span> <strong>${profile?.staff_code || '—'}</strong>
                        </div>` : ''}
                    </div>
                    <div style="border-top:1px solid #eee; padding:12px 20px;">
                        <button onclick="logout()" style="width:100%; padding:8px; background:#dc3545; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600; font-size:0.9rem;">
                            Log Out
                        </button>
                    </div>
                </div>
            </div>
        `
    }

    // Fetch categories from Supabase for the sidebar dropdown
    const { data: categories } = await supabase
        .from('categories')
        .select('name')
        .order('name')

    let dashboardLink = 'dashboard1.html'
    if (role === 'supervisor') dashboardLink = 'dashboard2.html'
    if (role === 'manager')    dashboardLink = 'dashboard3.html'

    sidebarNav.innerHTML = `<a href="${dashboardLink}" class="sidebar-link">Home</a>`

    sidebarNav.innerHTML += `<a href="catalog.html" class="sidebar-link">Catalog</a>`

    if (role === 'student') {
        sidebarNav.innerHTML += `<a href="submission.html" class="sidebar-link">Submit Proposal</a>`
        sidebarNav.innerHTML += `<a href="status.html"     class="sidebar-link">My Status</a>`
    } else if (role === 'supervisor') {
        sidebarNav.innerHTML += `<a href="review.html"  class="sidebar-link">Review Pending</a>`
    } else if (role === 'manager') {
        sidebarNav.innerHTML += `<a href="catalog.html?mode=update"  class="sidebar-link">Update Catalog</a>`
        sidebarNav.innerHTML += `<a href="dispense.html" class="sidebar-link">Component Request</a>`
        sidebarNav.innerHTML += `<a href="history.html"  class="sidebar-link">History</a>`
    }
    
    // Render category tab buttons inside catalog page
    const catNav = document.getElementById('catalog-category-nav')
    if (catNav && cats) {
        catNav.innerHTML = `<button onclick="filterCatalog()" style="padding:6px 14px; border-radius:20px; border:1px solid var(--main-blue); background:${!urlFilter ? 'var(--main-blue)' : 'white'}; color:${!urlFilter ? 'white' : 'var(--main-blue)'}; cursor:pointer; font-size:0.85rem;">All</button>`
        cats.forEach(c => {
            const isActive = urlFilter === c.name
            catNav.innerHTML += `<button onclick="window.location.href='catalog.html?filter=${encodeURIComponent(c.name)}'" style="padding:6px 14px; border-radius:20px; border:1px solid var(--main-blue); background:${isActive ? 'var(--main-blue)' : 'white'}; color:${isActive ? 'white' : 'var(--main-blue)'}; cursor:pointer; font-size:0.85rem;">${c.name}</button>`
        })
    }
}


// ============================================================
//  SIDEBAR — Category search filter (unchanged, no DB needed)
// ============================================================
export function filterSidebarCategories(query) {
    const links = document.querySelectorAll('#category-dropdown .sub-link')
    links.forEach(link => {
        link.style.display = link.textContent.toLowerCase().includes(query.toLowerCase())
            ? 'block' : 'none'
    })
}


// ============================================================
//  SIDEBAR — Toggle open/close
// ============================================================
export function toggleSidebar() {
    const sidebar = document.getElementById('side-panel')
    const content = document.getElementById('main-content')
    sidebar.classList.toggle('open')
    if (content) content.classList.toggle('shifted')
}

// ============================================================
//  Profile — Display profile
// ============================================================
export function toggleProfileDropdown() {
    const dropdown = document.getElementById('profile-dropdown')
    if (!dropdown) return
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none'

    // Close when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function closeDropdown(e) {
            if (!e.target.closest('#profile-dropdown') && !e.target.closest('button[onclick="toggleProfileDropdown()"]')) {
                dropdown.style.display = 'none'
                document.removeEventListener('click', closeDropdown)
            }
        })
    }, 100)
}

// ============================================================
//  CATALOG — Render component grid
// ============================================================
export async function renderCatalog() {
    const grid = document.getElementById('catalog-grid')
    if (!grid) return

    const role      = localStorage.getItem('userRole') || 'student'
    const urlParams = new URLSearchParams(window.location.search)
    const urlFilter = urlParams.get('filter')
    const searchTerm = (urlParams.get('search') || '').toLowerCase()
    const isUpdateMode = (role === 'manager' && urlParams.get('mode') === 'update')

    let query = supabase
        .from('components')
        .select('id, name, qty, categories(name), drawers(id, label, row_number, "drawer number", color_code, led_index, dispatch_active)')
        .order('name')

    if (urlFilter) {
        const { data: cat } = await supabase
            .from('categories')
            .select('id')
            .eq('name', urlFilter)
            .single()
        if (cat) query = query.eq('category_id', cat.id)
    }

    const { data: items, error } = await query

    if (error) {
        grid.innerHTML = `<p style="color:red;">Failed to load catalog: ${error.message}</p>`
        return
    }

    const filtered = searchTerm
        ? (items || []).filter(i => i.name.toLowerCase().includes(searchTerm))
        : (items || [])

    // Build controls
    const controls = document.getElementById('catalog-controls')
    if (controls) {
        const { data: cats } = await supabase.from('categories').select('name').order('name')
        let catOptions = '<option value="all">All Categories</option>'
        ;(cats || []).forEach(c => {
            catOptions += `<option value="${c.name}" ${urlFilter === c.name ? 'selected' : ''}>${c.name}</option>`
        })
        controls.innerHTML = `
            <input type="text" id="catalogSearch" placeholder="Search components..."
                   onkeyup="filterCatalog()" value="${searchTerm}"
                   style="padding:8px 12px; border:1px solid #ddd; border-radius:6px; min-width:220px;">
            <select id="categorySelect" onchange="filterCatalog()"
                    style="padding:8px; border:1px solid #ddd; border-radius:6px;">
                ${catOptions}
            </select>
            ${isUpdateMode ? `<button onclick="addNewComponent()"
                style="padding:8px 16px; background:var(--main-blue); color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600; white-space:nowrap;">
                + New Component</button>` : ''}
        `
    }

    grid.innerHTML = ''

    filtered.forEach(item => {
        const card = document.createElement('div')
        card.className = 'component-card'
        if (item.qty === 0 && !isUpdateMode) card.classList.add('out-of-stock')

        const drawer = item.drawers
        const row = drawer?.row_number ?? 'N/A'
        const drawerNum = drawer?.['drawer number'] ?? 'N/A'

        if (isUpdateMode) {
            card.innerHTML = `
                <h3>${item.name}</h3>
                <p style="color:#666; font-size:0.8rem;">${item.categories?.name || ''}</p>
                <span class="stock-tag" style="color:${item.qty > 0 ? 'green' : 'red'}">Stock: ${item.qty}</span>
                <div style="margin-top:8px; font-size:0.85rem; color:#444;">
                    <span>Row: <strong>${row}</strong></span> &nbsp;|&nbsp;
                    <span>Drawer: <strong>${drawerNum}</strong></span>
                </div>
                <div style="margin-top:10px; display:flex; gap:8px;">
                    <button onclick="findNow(${item.id}, '${drawer?.label || ''}')"
                        style="flex:1; padding:8px; background:var(--main-blue); color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;">
                        Find Now
                    </button>
                    <button onclick="editComponent(${item.id}, '${item.name}', ${item.qty}, '${drawer?.row_number ?? ''}', '${drawer?.label ?? ''}', '${drawer?.color_code ?? ''}', '${drawer?.led_index ? drawer.led_index.join(',') : ''}')"
                        style="flex:1; padding:8px; background:#f0a500; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;">
                        Edit
                    </button>
                </div>
                <button class="btn-remove" style="margin-top:8px; width:100%;" onclick="deleteComponent(${item.id})">Delete Item</button>
            `
        } else {
            card.innerHTML = `
                <h3>${item.name}</h3>
                <p style="color:#666; font-size:0.8rem;">${item.categories?.name || ''}</p>
                <span class="stock-tag" style="color:${item.qty > 0 ? 'green' : 'red'}">Stock: ${item.qty}</span>
            `
        }
        grid.appendChild(card)
    })
}


// ============================================================
//  CATALOG — Manager: update a component field
// ============================================================
export async function updateComponent(id, field, value) {
    const update = {}
    update[field] = field === 'qty' ? parseInt(value) : value

    const { error } = await supabase.from('components').update(update).eq('id', id)
    if (error) alert('Update failed: ' + error.message)
}


// ============================================================
//  CATALOG — Manager: assign a drawer to a component
// ============================================================
export async function assignDrawer(componentId, drawerLabel) {
    if (!drawerLabel) {
        // Unassign — set drawer_id to null
        const { error } = await supabase
            .from('components')
            .update({ drawer_id: null })
            .eq('id', componentId)
        if (error) alert('Failed to unassign drawer: ' + error.message)
        else renderCatalog()
        return
    }

    // Find the drawer id by label
    const { data: drawer, error: drawerError } = await supabase
        .from('drawers')
        .select('id, drawer_code')
        .eq('label', drawerLabel)
        .limit(1)
        .single()

    if (drawerError || !drawer) {
        alert('Drawer not found: ' + drawerLabel)
        return
    }

    const { error } = await supabase
        .from('components')
        .update({ drawer_id: drawer.id })
        .eq('id', componentId)

    if (error) alert('Failed to assign drawer: ' + error.message)
    else renderCatalog()
}


// ============================================================
//  CATALOG — Manager: delete a component
// ============================================================
export async function deleteComponent(id) {
    if (!confirm('Are you sure you want to delete this component?')) return

    // Get drawer_id first before deleting component
    const { data: comp } = await supabase
        .from('components')
        .select('drawer_id')
        .eq('id', id)
        .single()

    // Delete component first
    const { error } = await supabase.from('components').delete().eq('id', id)
    if (error) { alert('Delete failed: ' + error.message); return }

    // Then delete the linked drawer
    if (comp?.drawer_id) {
        await supabase.from('drawers').delete().eq('id', comp.drawer_id)
    }

    renderCatalog()
}


// ============================================================
//  CATALOG — Manager: Add New Component (LOCK TAKEN, ALLOW NEW/FREE)
// ============================================================
export async function addNewComponent() {
    // 1. Fetch categories and existing drawers from Supabase
    const { data: cats } = await supabase.from('categories').select('id, name').order('name')
    const { data: existingDrawers } = await supabase.from('drawers').select('label, component').order('id')

    // Generate category select options
    const categoryOptions = (cats || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('')
    
    // Create a live map of what labels are currently used
    const occupiedMap = {}
    if (existingDrawers) {
        existingDrawers.forEach(d => {
            if (d.label) {
                occupiedMap[d.label] = d.component || 'Another Item'
            }
        })
    }

    // 2. Build dynamic list up to D99. If taken, lock it out completely
    const allDrawers = Array.from({ length: 99 }, (_, i) => `D${i + 1}`)
    const drawerSuggestions = allDrawers.map(d => {
        const isTaken = occupiedMap[d] !== undefined
        if (isTaken) {
            // Unclickable/disabled options for taken drawers
            return `<option value="${d}" disabled style="color: #aaa;">${d} (taken by: ${occupiedMap[d]})</option>`
        }
        // Fully clickable options for free slots
        return `<option value="${d}">${d} [Free Slot]</option>`
    }).join('')

    // 3. Render the input form layout modal
    const modal = document.createElement('div')
    modal.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:10000; display:flex; align-items:center; justify-content:center;"
    modal.innerHTML = `
        <div style="background:white; padding:30px; border-radius:12px; width:420px; max-height:90vh; overflow-y:auto; box-shadow:0px 4px 15px rgba(0,0,0,0.2);">
            <h3 style="margin-top:0; color:var(--main-blue); margin-bottom:20px;">Add New Component</h3>

            <label style="display:block; font-weight:600; margin-bottom:5px; font-size:0.9rem;">Component Name:</label>
            <input type="text" id="new-comp-name" placeholder="e.g. Resistor 470Ω, 5W" style="width:100%; padding:8px; margin-bottom:15px; border:1px solid #ddd; border-radius:6px; box-sizing:border-box;">

            <label style="display:block; font-weight:600; margin-bottom:5px; font-size:0.9rem;">Category:</label>
            <select id="new-comp-cat" style="width:100%; padding:8px; margin-bottom:15px; border:1px solid #ddd; border-radius:6px;">
                ${categoryOptions}
            </select>

            <label style="display:block; font-weight:600; margin-bottom:5px; font-size:0.9rem;">Stock Quantity:</label>
            <input type="number" id="new-comp-qty" value="100" min="0" style="width:100%; padding:8px; margin-bottom:15px; border:1px solid #ddd; border-radius:6px; box-sizing:border-box;">

            <label style="display:block; font-weight:600; margin-bottom:5px; font-size:0.9rem;">Row Number:</label>
            <input type="number" id="new-comp-row" placeholder="e.g. 1" style="width:100%; padding:8px; margin-bottom:15px; border:1px solid #ddd; border-radius:6px; box-sizing:border-box;">

            <label style="display:block; font-weight:600; margin-bottom:5px; font-size:0.9rem;">Drawer Number:</label>
            <input type="number" id="new-comp-drawernum" placeholder="e.g. 3" style="width:100%; padding:8px; margin-bottom:15px; border:1px solid #ddd; border-radius:6px; box-sizing:border-box;">

            <label style="display:block; font-weight:600; margin-bottom:5px; font-size:0.9rem;">Label (e.g. D1):</label>
            <input type="text" id="new-comp-label" placeholder="e.g. D1" style="width:100%; padding:8px; margin-bottom:15px; border:1px solid #ddd; border-radius:6px; box-sizing:border-box;">

            <label style="display:block; font-weight:600; margin-bottom:5px; font-size:0.9rem;">Color Code:</label>
            <select id="new-comp-color" style="width:100%; padding:8px; margin-bottom:15px; border:1px solid #ddd; border-radius:6px; box-sizing:border-box;">
                <option value="red">Red</option>
                <option value="green">Green</option>
                <option value="blue">Blue</option>
            </select>

            <label style="display:block; font-weight:600; margin-bottom:5px; font-size:0.9rem;">LED Index (e.g. 1,2):</label>
            <input type="text" id="new-comp-led" placeholder="e.g. 1,2" style="width:100%; padding:8px; margin-bottom:20px; border:1px solid #ddd; border-radius:6px; box-sizing:border-box;">

            <div style="display:flex; gap:10px; justify-content:flex-end;">
                <button id="cancel-new-comp" style="padding:8px 16px; background:#ccc; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Cancel</button>
                <button id="save-new-comp" style="padding:8px 16px; background:green; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Save Item</button>
            </div>
        </div>
    `
    document.body.appendChild(modal)

    document.getElementById('cancel-new-comp').onclick = () => modal.remove()

    document.getElementById('save-new-comp').onclick = async () => {
    const name      = document.getElementById('new-comp-name').value.trim()
    const catId     = parseInt(document.getElementById('new-comp-cat').value)
    const qty       = parseInt(document.getElementById('new-comp-qty').value) || 0
    const rowNum    = parseInt(document.getElementById('new-comp-row').value) || 1
    const drawerNum = parseInt(document.getElementById('new-comp-drawernum').value) || 1
    const label     = document.getElementById('new-comp-label').value.trim().toUpperCase()
    const colorCode = document.getElementById('new-comp-color').value.trim()
    const ledRaw    = document.getElementById('new-comp-led').value.trim()

    if (!name)  { alert('Please enter a component name.'); return }
    if (!label) { alert('Please enter a drawer label (e.g. D1).'); return }

    if (occupiedMap[label]) {
        alert(`Drawer ${label} is already taken by: ${occupiedMap[label]}`)
        return
    }

    const { data: existingDrawer } = await supabase
        .from('drawers')
        .select('id')
        .eq('label', label)
        .maybeSingle()

    let finalDrawerId = null

    if (existingDrawer) {
        await supabase.from('drawers').update({
            row_number: rowNum,
            'drawer number': drawerNum,
            color_code: colorCode,
            lled_index: ledRaw ? ledRaw.split(',').map(s => parseInt(s.trim())) : null
        }).eq('label', label)
        finalDrawerId = existingDrawer.id
    } else {
        const { data: maxRow } = await supabase
            .from('drawers')
            .select('id')
            .order('id', { ascending: false })
            .limit(1)
            .single()

        const nextId = (maxRow?.id || 0) + 1

        const { data: newDrawer, error: drawerErr } = await supabase
            .from('drawers')
            .insert({
                id: nextId,
                label: label,
                component: name,
                row_number: rowNum,
                'drawer number': drawerNum,
                color_code: colorCode,
                led_index: ledRaw ? ledRaw.split(',').map(s => s.trim()) : null,
                dispatch_active: false
            })
            .select()
            .single()

        if (drawerErr) { alert('Failed to create drawer: ' + drawerErr.message); return }
        finalDrawerId = newDrawer.id
    }

    const { error: compError } = await supabase.from('components').insert({
        name: name,
        category_id: catId,
        qty: qty,
        drawer_id: finalDrawerId
    })

    if (compError) {
        alert('Failed to save component: ' + compError.message)
    } else {
        modal.remove()
        renderCatalog()
    }
    }
}


// ============================================================
//  CATALOG — Filter (Preserves View Mode)
// ============================================================
export function filterCatalog() {
    const searchTerm  = document.getElementById('catalogSearch').value.toLowerCase()
    const selectedCat = document.getElementById('categorySelect').value || 'all'

    const urlParams = new URLSearchParams(window.location.search)

    // Keep the current view mode state intact (e.g. mode=update)
    const currentMode = urlParams.get('mode')
    urlParams.clear()
    if (currentMode) urlParams.set('mode', currentMode)

    if (selectedCat && selectedCat !== 'all') {
        urlParams.set('filter', selectedCat)
    }
    if (searchTerm) {
        urlParams.set('search', searchTerm)
    }

    window.history.pushState({}, '', `catalog.html?${urlParams.toString()}`)
    renderCatalog()
}

// ============================================================
//  CATALOG — Find Now (LED highlight + reset)
// ============================================================
export async function findNow(componentId, drawerLabel) {
    // Set dispatch_active = TRUE for this drawer
    const { error } = await supabase
        .from('drawers')
        .update({ dispatch_active: true })
        .eq('label', drawerLabel)

    if (error) {
        alert('Failed to activate LED: ' + error.message)
        return
    }

    // Show popup with location info
    const modal = document.createElement('div')
    modal.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:10000; display:flex; align-items:center; justify-content:center;"
    modal.innerHTML = `
        <div style="background:white; padding:30px; border-radius:12px; width:320px; text-align:center; box-shadow:0 4px 15px rgba(0,0,0,0.2);">
            <h3 style="color:var(--main-blue); margin:10px 0;">LED Activated!</h3>
            <p style="color:#555;">Drawer <strong>${drawerLabel}</strong> is now lit up.</p>
            <p style="color:#555;">Go to the rack and locate the glowing drawer.</p>
            <button id="done-btn" style="margin-top:15px; width:100%; padding:10px; background:#28a745; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600; font-size:1rem;">
                DONE
            </button>
        </div>
    `
    document.body.appendChild(modal)

    // DONE button — reset LED back to FALSE
    document.getElementById('done-btn').onclick = async () => {
        await supabase
            .from('drawers')
            .update({ dispatch_active: false })
            .eq('label', drawerLabel)
        modal.remove()
    }
}

// ============================================================
//  CATALOG — Manager: Edit Component
// ============================================================
export async function editComponent(id, name, qty, rowNum, label, colorCode, ledIndex) {
    const modal = document.createElement('div')
    modal.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:10000; display:flex; align-items:center; justify-content:center;"
    modal.innerHTML = `
        <div style="background:white; padding:30px; border-radius:12px; width:420px; max-height:90vh; overflow-y:auto; box-shadow:0 4px 15px rgba(0,0,0,0.2);">
            <h3 style="margin-top:0; color:var(--main-blue); margin-bottom:20px;">Edit Component</h3>

            <label style="display:block; font-weight:600; margin-bottom:5px; font-size:0.9rem;">Component Name:</label>
            <input type="text" id="edit-name" value="${name}" style="width:100%; padding:8px; margin-bottom:15px; border:1px solid #ddd; border-radius:6px; box-sizing:border-box;">

            <label style="display:block; font-weight:600; margin-bottom:5px; font-size:0.9rem;">Stock:</label>
            <input type="number" id="edit-qty" value="${qty}" style="width:100%; padding:8px; margin-bottom:15px; border:1px solid #ddd; border-radius:6px; box-sizing:border-box;">

            <label style="display:block; font-weight:600; margin-bottom:5px; font-size:0.9rem;">Row Number:</label>
            <input type="number" id="edit-row" value="${rowNum}" style="width:100%; padding:8px; margin-bottom:15px; border:1px solid #ddd; border-radius:6px; box-sizing:border-box;">

            <label style="display:block; font-weight:600; margin-bottom:5px; font-size:0.9rem;">Drawer Label (e.g. D1):</label>
            <input type="text" id="edit-label" value="${label}" style="width:100%; padding:8px; margin-bottom:15px; border:1px solid #ddd; border-radius:6px; box-sizing:border-box;">

            <label style="display:block; font-weight:600; margin-bottom:5px; font-size:0.9rem;">Color Code:</label>
            <select id="edit-color" style="width:100%; padding:8px; margin-bottom:15px; border:1px solid #ddd; border-radius:6px; box-sizing:border-box;">
                <option value="red" ${colorCode === 'red' ? 'selected' : ''}>Red</option>
                <option value="green" ${colorCode === 'green' ? 'selected' : ''}>Green</option>
                <option value="blue" ${colorCode === 'blue' ? 'selected' : ''}>Blue</option>
            </select>

            <label style="display:block; font-weight:600; margin-bottom:5px; font-size:0.9rem;">LED Index (e.g. 1,2):</label>
            <input type="text" id="edit-led" value="${ledIndex}" placeholder="e.g. 1,2" style="width:100%; padding:8px; margin-bottom:20px; border:1px solid #ddd; border-radius:6px; box-sizing:border-box;">

            <div style="display:flex; gap:10px; justify-content:flex-end;">
                <button id="edit-cancel" style="padding:8px 16px; background:#ccc; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Cancel</button>
                <button id="edit-save" style="padding:8px 16px; background:green; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Save</button>
            </div>
        </div>
    `
    document.body.appendChild(modal)

    document.getElementById('edit-cancel').onclick = () => modal.remove()

    document.getElementById('edit-save').onclick = async () => {
        const newName  = document.getElementById('edit-name').value.trim()
        const newQty   = parseInt(document.getElementById('edit-qty').value)
        const newRow   = parseInt(document.getElementById('edit-row').value)
        const newLabel = document.getElementById('edit-label').value.trim().toUpperCase()
        const newColor = document.getElementById('edit-color').value.trim()
        const newLed   = document.getElementById('edit-led').value.trim()

        if (!newName) { alert('Component name cannot be empty.'); return }

        // Update component
        const { error: compError } = await supabase
            .from('components')
            .update({ name: newName, qty: newQty })
            .eq('id', id)

        if (compError) { alert('Failed to update component: ' + compError.message); return }

        // Update drawer using original label
        if (label) {
            const { error: drawerError } = await supabase
                .from('drawers')
                .update({
                    row_number: newRow,
                    label: newLabel,
                    color_code: newColor,
                    led_index: newLed ? newLed.split(',').map(s => s.trim()) : null
                })
                .eq('label', label)

            if (drawerError) { alert('Failed to update drawer: ' + drawerError.message); return }
        }

        modal.remove()
        renderCatalog()
    }
}

// ============================================================
//  SUBMISSION — Populate component dropdown
// ============================================================
export async function populateDropdown() {
    const selector = document.getElementById('component-selector')
    if (!selector) return

    const { data: items } = await supabase
        .from('components')
        .select('id, name, qty')
        .gt('qty', 0)        // Only show in-stock items
        .order('name')

    selector.innerHTML = '<option value="">-- Choose Item --</option>'
    ;(items || []).forEach(item => {
        selector.innerHTML += `<option value="${item.name}">${item.name} (Available: ${item.qty})</option>`
    })
}


// ============================================================
//  SUBMISSION — Add item to the request list (UI only)
// ============================================================
export function addItemToList(type) {
    const container = document.getElementById('selected-items-container')
    let itemName = ''
    let isCustom = false

    if (type === 'store') {
        const selector = document.getElementById('component-selector')
        itemName = selector.value
        if (!itemName) return
    } else {
        const customInput = document.getElementById('custom-item-name')
        itemName = customInput.value.trim()
        isCustom = true
        if (!itemName) return
        customInput.value = ''
    }

    if (document.getElementById(`row-${itemName}`)) {
        alert('Item already in list!')
        return
    }

    const row      = document.createElement('div')
    row.className  = 'item-row'
    row.id         = `row-${itemName}`
    const tagColor = isCustom ? '#6c757d' : 'var(--main-blue)'
    const tagText  = isCustom ? 'EXTERNAL' : 'STORE'

    row.innerHTML = `
        <div>
            <span style="font-weight:600;">${itemName}</span>
            <small style="background:${tagColor}; color:white; padding:2px 6px; border-radius:4px; margin-left:8px; font-size:0.6rem;">${tagText}</small>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
            <label style="font-size:0.8rem;">Qty:</label>
            <input type="number" class="qty-input" value="1" min="1">
            <button type="button" class="btn-remove" onclick="this.parentElement.parentElement.remove()">X</button>
        </div>
    `
    container.appendChild(row)
}


// ============================================================
//  SUBMISSION — Submit proposal to Supabase
// ============================================================
export async function submitProposal(e) {
    e.preventDefault()

    const user = await getCurrentUser()
    if (!user) { alert('You must be logged in.'); return }

    // 1. Upload circuit diagram to Supabase Storage
    const fileInput = document.getElementById('circuit-upload')
    const file      = fileInput.files[0]
    let diagramUrl  = null

    if (file) {
        const fileName = `${user.id}_${Date.now()}_${file.name}`
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('diagrams')
            .upload(fileName, file)

        if (uploadError) {
            alert('Diagram upload failed: ' + uploadError.message)
            return
        }

        const { data: urlData } = supabase.storage.from('diagrams').getPublicUrl(fileName)
        diagramUrl = urlData.publicUrl
    }

    // 2. Get supervisor ID from student's profile
    const supervisorId = user.profile?.supervisor_id
    if (!supervisorId) {
        alert('No supervisor linked to your account. Please contact admin.')
        return
    }

    // 3. Insert proposal row
    const { data: proposal, error: propError } = await supabase
        .from('proposals')
        .insert({
            student_id:        user.id,
            supervisor_id:     supervisorId,
            project_name:      `Project by ${user.profile.full_name}`,
            diagram_url:       diagramUrl,
            supervisor_status: 'Pending',
            store_status:      'Waiting'
        })
        .select()
        .single()

    if (propError) {
        alert('Submission failed: ' + propError.message)
        return
    }

    // 4. Insert each item row into proposal_items
    const rows = document.querySelectorAll('#selected-items-container .item-row')
    for (const row of rows) {
        const itemName  = row.querySelector('span').innerText.trim()
        const qty       = parseInt(row.querySelector('.qty-input').value)
        const isCustom  = row.querySelector('small').innerText === 'EXTERNAL'

        let componentId = null
        if (!isCustom) {
            const { data: comp } = await supabase
                .from('components')
                .select('id')
                .eq('name', itemName)
                .single()
            componentId = comp?.id || null
        }

        await supabase.from('proposal_items').insert({
            proposal_id:   proposal.id,
            component_id:  componentId,
            custom_name:   isCustom ? itemName : null,
            qty_requested: qty,
            is_custom:     isCustom
        })
    }

    alert('Proposal submitted successfully!')
    window.location.href = 'status.html'
}


// ============================================================
//  STATUS PAGE — Student views their own proposals
// ============================================================
export async function renderStatus() {
    const container = document.getElementById('status-container')
    if (!container) return

    const user = await getCurrentUser()
    if (!user) return

    const { data: proposals, error } = await supabase
        .from('proposals')
        .select('*, proposal_items(*, components(name))')
        .eq('student_id', user.id)
        .order('submitted_at', { ascending: false })

    if (error) {
        container.innerHTML = `<p style="color:red;">Error loading proposals: ${error.message}</p>`
        return
    }

    if (!proposals || proposals.length === 0) {
        container.innerHTML = `<p style="color:#888; text-align:center; margin-top:40px;">No proposals submitted yet.</p>`
        return
    }

    container.innerHTML = proposals.map(prop => {
        const bagDisplay = prop.store_status === 'Done'
            ? `<div class="bag-code-box">YOUR COLLECTION CODE: <strong>${prop.bag_code}</strong></div>`
            : `<div class="bag-waiting">Bag is being packed...</div>`

        return `
            <div class="proposal-card" style="background:white; padding:20px; border-radius:12px; border:1px solid #eee; margin-bottom:20px;">
                <h3>Proposal ID: ${prop.id}</h3>
                <p style="color:#666; font-size:0.9rem;">Project: ${prop.project_name}</p>
                <div style="display:flex; gap:15px; margin-top:10px;">
                    <div>Supervisor: <span class="badge-${prop.supervisor_status.toLowerCase()}">${prop.supervisor_status}</span></div>
                    <div>Store: <span class="badge-pending">${prop.store_status}</span></div>
                </div>
                ${prop.feedback ? `<p style="margin-top:10px; font-style:italic; color:#777;">Feedback: ${prop.feedback}</p>` : ''}
                ${prop.supervisor_status === 'Approved' ? bagDisplay : ''}
            </div>
        `
    }).join('')
}


// ============================================================
//  STUDENT DASHBOARD
// ============================================================
export async function renderStudentDashboard() {
    const welcome = document.getElementById('welcome-msg')
    if (!welcome) return

    const user = await getCurrentUser()
    if (!user) return

    welcome.innerText = `Welcome back, ${user.profile?.full_name || 'Student'}!`

    const { data: proposals } = await supabase
        .from('proposals')
        .select('supervisor_status, store_status')
        .eq('student_id', user.id)

    const total    = (proposals || []).length
    const approved = (proposals || []).filter(p => p.supervisor_status === 'Approved').length
    const ready    = (proposals || []).filter(p => p.store_status === 'Done').length

    document.getElementById('stat-active-proposals').innerText = total.toString().padStart(2, '0')
    document.getElementById('stat-approved-items').innerText   = approved.toString().padStart(2, '0')
    document.getElementById('stat-ready-pickup').innerText     = ready.toString().padStart(2, '0')

    // Latest activity
    const { data: latest } = await supabase
        .from('proposals')
        .select('id, supervisor_status, store_status')
        .eq('student_id', user.id)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .single()

    const activityContainer = document.getElementById('latest-activity-container')
    if (activityContainer && latest) {
        activityContainer.innerHTML = `
            <h3>Latest Activity</h3>
            <div class="activity-item">
                <p><strong>${latest.id}</strong>: ${latest.supervisor_status} (Supervisor) | ${latest.store_status} (Store)</p>
                <div class="progress-bar-mini">
                    <div class="progress-fill" style="width:${latest.store_status === 'Done' ? '100%' : '50%'}"></div>
                </div>
            </div>
        `
    }
}


// ============================================================
//  SUPERVISOR DASHBOARD
// ============================================================
export async function renderSupervisorDashboard() {
    const pendingContainer = document.getElementById('pending-list-container')
    if (!pendingContainer) return

    const user = await getCurrentUser()
    if (!user) return

    const { data: proposals } = await supabase
        .from('proposals')
        .select('*, profiles!proposals_student_id_fkey(full_name)')
        .eq('supervisor_id', user.id)
        .order('submitted_at', { ascending: false })

    const pending  = (proposals || []).filter(p => p.supervisor_status === 'Pending')
    const approved = (proposals || []).filter(p => p.supervisor_status === 'Approved')
    const declined = (proposals || []).filter(p => p.supervisor_status === 'Declined')
    const history  = (proposals || []).filter(p => p.supervisor_status !== 'Pending')

    document.getElementById('sup-stat-pending').innerText  = pending.length.toString().padStart(2, '0')
    document.getElementById('sup-stat-approved').innerText = approved.length.toString().padStart(2, '0')
    document.getElementById('sup-stat-declined').innerText = declined.length.toString().padStart(2, '0')

    // Pending action list
    pendingContainer.innerHTML = ''
    if (pending.length === 0) {
        pendingContainer.innerHTML = `<p style="color:#888;">No pending proposals to review.</p>`
    } else {
        pending.forEach(p => {
            pendingContainer.innerHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:#f9f9f9; margin-bottom:10px; border-radius:8px;">
                    <div>
                        <p style="margin:0; font-weight:600;">${p.profiles?.full_name || 'Unknown'}</p>
                        <small>${p.id}</small>
                    </div>
                    <a href="review.html?id=${p.id}" class="btn-role" style="font-size:0.7rem; padding:5px 10px;">REVIEW</a>
                </div>
            `
        })
    }

    // Recent decision history table
    const historyBody = document.getElementById('history-table-body')
    if (historyBody) {
        historyBody.innerHTML = history.length === 0
            ? `<tr><td colspan="3" style="color:#888; text-align:center;">No decision history yet.</td></tr>`
            : history.map(p => `
                <tr>
                    <td>${p.profiles?.full_name || '—'}</td>
                    <td>${p.id}</td>
                    <td><span class="status-badge badge-${p.supervisor_status.toLowerCase()}">${p.supervisor_status}</span></td>
                </tr>
            `).join('')
    }
}


// ============================================================
//  REVIEW PAGE — Load pending proposals list
// ============================================================
export async function renderMasterStudentList(currentSelectedId = null) {
    const listContainer  = document.getElementById('master-student-list')
    const pendingCount   = document.getElementById('pending-count')
    if (!listContainer) return

    const user = await getCurrentUser()
    if (!user) return

    const { data: pending } = await supabase
        .from('proposals')
        .select('id, project_name, profiles!proposals_student_id_fkey(full_name), proposal_items(id)')
        .eq('supervisor_id', user.id)
        .eq('supervisor_status', 'Pending')

    if (pendingCount) pendingCount.innerText = (pending || []).length

    listContainer.innerHTML = ''

    if (!pending || pending.length === 0) {
        listContainer.innerHTML = `<p style="color:#888; font-size:0.9rem; text-align:center;">No proposals pending.</p>`
        return
    }

    pending.forEach(prop => {
        const item     = document.createElement('div')
        item.className = `student-item ${currentSelectedId === prop.id ? 'active' : ''}`
        item.onclick   = () => loadProposalDetails(prop.id)
        item.innerHTML = `
            <p style="margin:0; font-weight:600;">${prop.profiles?.full_name || 'Unknown'}</p>
            <small>${prop.project_name} | ${prop.proposal_items?.length || 0} Items</small>
        `
        listContainer.appendChild(item)
    })
}


// ============================================================
//  REVIEW PAGE — Load proposal detail into right panel
// ============================================================
export async function loadProposalDetails(proposalId) {
    const { data: prop } = await supabase
        .from('proposals')
        .select('*, profiles!proposals_student_id_fkey(full_name), proposal_items(*, components(name))')
        .eq('id', proposalId)
        .single()

    if (!prop) return

    document.getElementById('current-student-name').innerText  = prop.profiles?.full_name || '—'
    document.getElementById('current-proposal-id').innerText   = prop.id
    document.getElementById('diagram-preview').src             = prop.diagram_url || ''

    const tableBody = document.getElementById('component-table-body')
    tableBody.innerHTML = ''
    prop.proposal_items.forEach(item => {
        const name = item.is_custom ? item.custom_name : item.components?.name || '—'
        tableBody.innerHTML += `
            <tr>
                <td>${name}</td>
                <td>${item.qty_requested}</td>
                <td><span class="status-badge badge-approved" style="font-size:0.7rem;">${item.is_custom ? 'External' : 'Verified'}</span></td>
            </tr>
        `
    })

    // Store the active ID for the decision handler
    window._activeProposalId = proposalId
    renderMasterStudentList(proposalId)
}


// ============================================================
//  REVIEW PAGE — Approve or Decline
// ============================================================
export async function handleDecision(decision) {
    const proposalId = window._activeProposalId
    if (!proposalId) return

    const feedback = document.getElementById('feedback-comment').value

    if (decision === 'Declined' && feedback.trim() === '') {
        alert('Please provide feedback or a reason for declination.')
        return
    }

    const { error } = await supabase
        .from('proposals')
        .update({
            supervisor_status: decision,
            feedback:          feedback,
            reviewed_at:       new Date()
        })
        .eq('id', proposalId)

    if (error) {
        alert('Failed to save decision: ' + error.message)
        return
    }

    window._activeProposalId = null
    document.getElementById('feedback-comment').value = ''
    alert(`Proposal has been ${decision}.`)
    renderMasterStudentList()
}


// ============================================================
//  DISPENSE PAGE — Render both tables
// ============================================================
export async function renderDispenseTables() {
    const approvedBody = document.getElementById('approved-proposals-body')
    const readyBody    = document.getElementById('collection-ready-body')
    if (!approvedBody || !readyBody) return

    const { data: proposals } = await supabase
        .from('proposals')
        .select('*, profiles!proposals_student_id_fkey(full_name), proposal_items(id)')

    // Table 1: Approved by supervisor, store hasn't packed yet
    const approved = (proposals || []).filter(p =>
        p.supervisor_status === 'Approved' && p.store_status === 'Waiting'
    )
    approvedBody.innerHTML = approved.length === 0
        ? `<tr><td colspan="4" style="text-align:center; color:#999; padding:20px;">No proposals waiting to be packed.</td></tr>`
        : approved.map(p => `
            <tr>
                <td>${p.profiles?.full_name || '—'}</td>
                <td>${p.project_name}</td>
                <td>${p.proposal_items?.length || 0} items</td>
                <td><button onclick="openProposal('${p.id}')" class="btn-role" style="padding:5px 10px;">OPEN</button></td>
            </tr>
        `).join('')

    // Table 2: Store marked Done, waiting for student pickup
    const ready = (proposals || []).filter(p => p.store_status === 'Done')
    readyBody.innerHTML = ready.length === 0
        ? `<tr><td colspan="4" style="text-align:center; color:#999; padding:20px;">No bags ready for collection.</td></tr>`
        : ready.map(p => `
            <tr>
                <td>${p.profiles?.full_name || '—'}</td>
                <td><span class="code-tag">${p.bag_code}</span></td>
                <td><span class="status-badge badge-approved">READY</span></td>
                <td><button onclick="markCollected('${p.id}')" class="btn-role" style="background:#333; color:white; border:none;">COLLECTED</button></td>
            </tr>
        `).join('')
}


// ============================================================
//  DISPENSE PAGE — Open proposal modal (SEARCH ALL LINKED FIX)
// ============================================================
export async function openProposal(id) {
    window._activeDispenseId = id

    const { data: prop } = await supabase
        .from('proposals')
        .select('*, profiles!proposals_student_id_fkey(full_name), proposal_items(*, components(name, drawers(label, "drawer number", led_index)))')
        .eq('id', id)
        .single()

    document.getElementById('modal-student-name').innerText = prop.profiles?.full_name || '—'

    // 1. Create a clean list to store all the valid rack labels for this proposal
    const validRackLabels = []

    const listBody = document.getElementById('modal-item-list')
    listBody.innerHTML = prop.proposal_items.map(item => {
        const name     = item.is_custom ? item.custom_name : item.components?.name || '—'
        const drawer   = item.components?.drawers
        const rackCode = (drawer && drawer.label) ? drawer.label.trim() : 'N/A'
        
        let singleLed = null
        if (drawer && drawer.led_index) {
            singleLed = Array.isArray(drawer.led_index) ? drawer.led_index[0] : drawer.led_index
            singleLed = String(singleLed).replace(/[^0-9]/g, '')
        }

        // If this item has a valid drawer, add it to our global search list
        if (rackCode !== 'N/A') {
            validRackLabels.push(rackCode)
        }

        const searchBtn = (singleLed && rackCode !== 'N/A')
            ? `<button onclick="window.sendToESP32(${parseInt(singleLed)}, '${rackCode}')" 
                       class="btn-role" 
                       style="background:var(--open-green); color:white; border:none; padding:5px 12px; cursor:pointer;">SEARCH</button>`
            : `<button class="btn-role" style="background:#aaa; color:white; border:none; padding:5px 12px; cursor:not-allowed;" disabled>SEARCH</button>`

        return `
            <tr>
                <td>${name}</td>
                <td>${item.qty_requested}</td>
                <td><span style="color:#ff9800; font-weight:600;">${rackCode}</span></td>
                <td>${searchBtn}</td>
            </tr>
        `
    }).join('')

    document.getElementById('proposal-modal').style.display = 'block'
    document.getElementById('done-btn').onclick = () => finalizePacking(id)

    // 2. NEW FIX: Find the SEARCH ALL button in your HTML and link its click action dynamically!
    const searchAllBtn = document.getElementById('search-all-btn') // Make sure your HTML button has id="search-all-btn"!
    if (searchAllBtn) {
        searchAllBtn.onclick = async () => {
            if (validRackLabels.length === 0) {
                alert('No valid rack drawers found to search in this proposal.')
                return
            }

            try {
                const { error } = await supabase
                    .from('drawers')
                    .update({ dispatch_active: true })
                    .in('label', validRackLabels)
                if (error) throw error

                // Show DONE popup for all drawers
                const modal = document.createElement('div')
                modal.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:20000; display:flex; align-items:center; justify-content:center;"
                modal.innerHTML = `
                    <div style="background:white; padding:30px; border-radius:12px; width:340px; text-align:center; box-shadow:0 4px 15px rgba(0,0,0,0.2);">
                        <h3 style="color:var(--main-blue); margin:10px 0;">All LEDs Activated!</h3>
                        <p style="color:#555;">Drawers lit up: <strong>${validRackLabels.join(', ')}</strong></p>
                        <p style="color:#555;">Collect all components then press DONE.</p>
                        <button id="search-all-done-btn" style="margin-top:15px; width:100%; padding:10px; background:#28a745; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600; font-size:1rem;">
                            DONE — Turn Off All LEDs
                        </button>
                    </div>
                `
                document.body.appendChild(modal)

                document.getElementById('search-all-done-btn').onclick = async () => {
                    await supabase
                        .from('drawers')
                        .update({ dispatch_active: false })
                        .in('label', validRackLabels)
                    modal.remove()
                }

            } catch (err) {
                alert('Failed to activate all drawers: ' + err.message)
            }
        }
    }
}


// ============================================================
//  DISPENSE PAGE — Close modaldd
// ============================================================
export function closeModal() {
    document.getElementById('proposal-modal').style.display = 'none'
}


// ============================================================
//  DISPENSE PAGE — Highlight all drawers for active proposal
// ============================================================
export async function highlightAllDrawers() {
    const id = window._activeDispenseId
    if (!id) return

    const { data: prop } = await supabase
        .from('proposals')
        .select('proposal_items(components(name, drawers(label, led_index)))')
        .eq('id', id)
        .single()

    const items = prop?.proposal_items || []
    const drawerList = items
        .map(i => i.components?.drawers?.label)
        .filter(Boolean)

    if (drawerList.length === 0) {
        alert('No drawers assigned to any component in this proposal.')
        return
    }

    alert('Drawers to visit: ' + drawerList.join(', '))
}


// ============================================================
//  DISPENSE PAGE — Send LED signal to ESP32 via Supabase
//  The ESP32 subscribes to Supabase Realtime on the
//  'store_settings' table and reads the led_target column.
// ============================================================
export async function sendToESP32(ledIndex, rackCode) {
    try {
        const { error: storeError } = await supabase
            .from('store_settings')
            .update({ led_target: ledIndex })
            .eq('id', 1)
        if (storeError) throw storeError

        const { error: drawerError } = await supabase
            .from('drawers')
            .update({ dispatch_active: true })
            .eq('label', rackCode)
        if (drawerError) throw drawerError

        // Show DONE popup
        const modal = document.createElement('div')
        modal.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:20000; display:flex; align-items:center; justify-content:center;"
        modal.innerHTML = `
            <div style="background:white; padding:30px; border-radius:12px; width:320px; text-align:center; box-shadow:0 4px 15px rgba(0,0,0,0.2);">
                <h3 style="color:var(--main-blue); margin:10px 0;">LED Activated!</h3>
                <p style="color:#555;">Rack <strong>${rackCode}</strong> is now lit up.</p>
                <p style="color:#555;">Go to the rack and collect the component.</p>
                <button id="esp-done-btn" style="margin-top:15px; width:100%; padding:10px; background:#28a745; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600; font-size:1rem;">
                    DONE
                </button>
            </div>
        `
        document.body.appendChild(modal)

        document.getElementById('esp-done-btn').onclick = async () => {
            await supabase
                .from('drawers')
                .update({ dispatch_active: false })
                .eq('label', rackCode)
            modal.remove()
        }

    } catch (err) {
        alert('Failed to send signal: ' + err.message)
    }
}

// ============================================================
//  DISPENSE PAGE — Finalize packing, generate bag code
// ============================================================
export async function finalizePacking(id) {
    const { data: prop } = await supabase
        .from('proposals')
        .select('proposal_items(qty_requested, components(id, qty, name))')
        .eq('id', id)
        .single()

    // Check stock and deduct
    let allInStock = true
    for (const item of prop.proposal_items) {
        if (!item.components || item.components.qty < item.qty_requested) {
            allInStock = false
            break
        }
    }

    if (!allInStock) {
        // Auto-reject if stock ran out
        await supabase.from('proposals').update({
            supervisor_status: 'Declined',
            feedback: 'AUTO-REJECT: Some components went out of stock during processing.'
        }).eq('id', id)

        alert('STOCK DEPLETED: Proposal automatically rejected and student notified.')
    } else {
        // Deduct stock for each item
        for (const item of prop.proposal_items) {
            await supabase
                .from('components')
                .update({ qty: item.components.qty - item.qty_requested })
                .eq('id', item.components.id)
        }

        const bagCode = 'BAG-' + Math.floor(1000 + Math.random() * 9000)

        await supabase.from('proposals').update({
            store_status:  'Done',
            bag_code:      bagCode,
            dispensed_at:  new Date()
        }).eq('id', id)
        // Reset all LEDs for this proposal
        const { data: propItems } = await supabase
            .from('proposals')
            .select('proposal_items(components(drawers(label)))')
            .eq('id', id)
            .single()

        const labels = (propItems?.proposal_items || [])
            .map(i => i.components?.drawers?.label)
            .filter(Boolean)

        if (labels.length > 0) {
            await supabase
                .from('drawers')
                .update({ dispatch_active: false })
                .in('label', labels)
        }

        alert(`Success! Bag Generated: ${bagCode}`)
    }

    document.getElementById('proposal-modal').style.display = 'none'
    renderDispenseTables()
}


// ============================================================
//  DISPENSE PAGE — Mark as collected
// ============================================================
export async function markCollected(id) {
    const { error } = await supabase
        .from('proposals')
        .update({ store_status: 'Collected' })
        .eq('id', id)

    if (error) alert('Failed to update: ' + error.message)
    else {
        alert('Hand-over complete. Transaction saved to history.')
        renderDispenseTables()
    }
}


// ============================================================
//  HISTORY PAGE — Interactive Filter & Rendering Logic (FIXED)
// ============================================================
let activeMovementChart = null; // Holds instance reference to prevent canvas redraw errors

export async function renderEnhancedHistory() {
    const propBody = document.getElementById('history-proposal-body')
    const dispBody = document.getElementById('history-dispense-body')
    const monthSelect = document.getElementById('month-select')

    if (!propBody || !dispBody) return

    // 1. Fetch raw datasets from Supabase
    const { data: proposals } = await supabase
        .from('proposals')
        .select('*, profiles!proposals_student_id_fkey(full_name), proposal_items(qty_requested, components(name))')
        .order('submitted_at', { ascending: false })

    const safeProposals = proposals || [];

    // 2. Render traditional tables globally
    propBody.innerHTML = safeProposals.map(p => `
    <tr>
        <td>${new Date(p.submitted_at).toLocaleDateString('en-MY')}</td>
        <td style="font-weight:600;">${p.profiles?.full_name || '—'}</td>
        <td>${p.project_name}</td>
        <td><span class="status-badge badge-${p.supervisor_status.toLowerCase()}">${p.supervisor_status}</span></td>
        <td style="font-style:italic; color:#777;">${p.feedback || '—'}</td>
    </tr>
`).join('')

    const dispensed = safeProposals.filter(p => p.store_status === 'Done' || p.store_status === 'Collected')

    dispBody.innerHTML = dispensed.length === 0
        ? `<tr><td colspan="5" style="text-align:center; color:#999; padding:20px;">No items have been dispensed yet.</td></tr>`
        : dispensed.map(p => {
    const itemNames = p.proposal_items.map(i => {
        const name = i.components?.name || i.custom_name || 'Custom'
        return `${name} (x${i.qty_requested})`
    }).join(', ')
    return `
        <tr>
            <td>${p.dispensed_at ? new Date(p.dispensed_at).toLocaleDateString('en-MY') : '—'}</td>
            <td style="font-weight:600;">${p.profiles?.full_name || '—'}</td>
            <td><span class="code-tag">${p.bag_code || '—'}</span></td>
            <td>${itemNames}</td>
            <td><span class="status-badge badge-approved">FULFILLED</span></td>
        </tr>
    `
}).join('')

    // 3. Isolated Functional Core: Monthly Metric Analytics Computation Engine
    function calculateMonthlyMetrics() {
        const selectedTarget = monthSelect ? monthSelect.value : "2026-05"; 
        const [targetYear, targetMonth] = selectedTarget.split('-');

        let totalDispensedCount = 0;

        dispensed.forEach(p => {
            if (p.dispensed_at) {
                const dDate = new Date(p.dispensed_at);
                const dYear = dDate.getFullYear().toString();
                const dMonth = (dDate.getMonth() + 1).toString().padStart(2, '0');

                if (dYear === targetYear && dMonth === targetMonth) {
                    p.proposal_items.forEach(item => {
                        totalDispensedCount += (item.qty_requested || 0);
                    });
                }
            }
        });

        // Update display numbers
        document.getElementById('total-dispensed-val').innerText = totalDispensedCount

        const mockAddedValue = totalDispensedCount > 0 ? Math.floor(totalDispensedCount * 1.5) : 120
            document.getElementById('total-added-val').innerText = mockAddedValue

        // Build breakdown list
        const breakdownContainer = document.getElementById('dispensed-breakdown')
        if (breakdownContainer) {
            const itemMap = {}
            dispensed.forEach(p => {
                if (!p.dispensed_at) return
                const dDate = new Date(p.dispensed_at)
                const dYear = dDate.getFullYear().toString()
                const dMonth = (dDate.getMonth() + 1).toString().padStart(2, '0')
                if (dYear !== targetYear || dMonth !== targetMonth) return

                p.proposal_items.forEach(item => {
                    const name = item.components?.name || 'Custom'
                    if (!itemMap[name]) itemMap[name] = 0
                    itemMap[name] += (item.qty_requested || 0)
                })
            })

            const entries = Object.entries(itemMap)
            if (entries.length === 0) {
                breakdownContainer.innerHTML = '<p style="color:#999; font-size:0.85rem;">No data for this month.</p>'
            } else {
                breakdownContainer.innerHTML = `
                    <details style="margin-top:10px;">
                        <summary style="cursor:pointer; font-weight:600; color:var(--main-blue); font-size:0.9rem;">View Breakdown ▾</summary>
                        <table style="width:100%; margin-top:10px; border-collapse:collapse; font-size:0.85rem;">
                            <thead>
                                <tr>
                                    <th style="text-align:left; padding:6px; border-bottom:1px solid #eee; color:#555;">Component</th>
                                    <th style="text-align:left; padding:6px; border-bottom:1px solid #eee; color:#555;">Qty Dispensed</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${entries.map(([name, qty]) => `
                                    <tr>
                                        <td style="padding:6px; border-bottom:1px solid #f5f5f5;">${name}</td>
                                        <td style="padding:6px; border-bottom:1px solid #f5f5f5; font-weight:600;">${qty}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </details>
                `
            }
        }
        const addedBreakdown = document.getElementById('added-breakdown')
        if (addedBreakdown) {
            const addedMap = {}
            dispensed.forEach(p => {
                if (!p.dispensed_at) return
                const dDate = new Date(p.dispensed_at)
                const dYear = dDate.getFullYear().toString()
                const dMonth = (dDate.getMonth() + 1).toString().padStart(2, '0')
                if (dYear !== targetYear || dMonth !== targetMonth) return

                p.proposal_items.forEach(item => {
                    const name = item.components?.name || 'Custom'
                    if (!addedMap[name]) addedMap[name] = 0
                    addedMap[name] += (item.qty_requested || 0)
                })
            })

            const addedEntries = Object.entries(addedMap)
            if (addedEntries.length === 0) {
                addedBreakdown.innerHTML = '<p style="color:#999; font-size:0.85rem;">No data for this month.</p>'
            } else {
                addedBreakdown.innerHTML = `
                    <details style="margin-top:10px;">
                        <summary style="cursor:pointer; font-weight:600; color:#28a745; font-size:0.9rem;">View Added Stock ▾</summary>
                        <table style="width:100%; margin-top:10px; border-collapse:collapse; font-size:0.85rem;">
                            <thead>
                                <tr>
                                    <th style="text-align:left; padding:6px; border-bottom:1px solid #eee; color:#555;">Component</th>
                                    <th style="text-align:left; padding:6px; border-bottom:1px solid #eee; color:#555;">Qty</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${addedEntries.map(([name, qty]) => `
                                    <tr>
                                        <td style="padding:6px; border-bottom:1px solid #f5f5f5;">${name}</td>
                                        <td style="padding:6px; border-bottom:1px solid #f5f5f5; font-weight:600;">${qty}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </details>
                `
            }
        }

        // TARGET CONTAINER OVERRIDE: Clear layout cache traces safely
        const wrapper = document.getElementById('chart-wrapper');
        if (!wrapper) return;

        if (activeMovementChart) {
            activeMovementChart.destroy();
            activeMovementChart = null;
        }

        // Re-inject a clean canvas element before rendering
        wrapper.innerHTML = '<canvas id="movementChart"></canvas>';
        const targetCanvas = document.getElementById('movementChart');

        const totalDataSum = totalDispensedCount + mockAddedValue;

        if (totalDataSum > 0 && targetCanvas) {
            activeMovementChart = new Chart(targetCanvas, {
                type: 'pie',
                data: {
                    labels: ['Total Dispensed', 'New Stock Added'],
                    datasets: [{
                        data: [totalDispensedCount, mockAddedValue],
                        backgroundColor: ['#0077B6', '#28a745'], 
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
        }
    }

    // Bind event dynamic listeners to drop change operations
    if (monthSelect && !monthSelect.dataset.listenerBound) {
        monthSelect.addEventListener('change', calculateMonthlyMetrics);
        monthSelect.dataset.listenerBound = "true";
    }

    // Trigger on structural processing completion
    calculateMonthlyMetrics();
}


// ============================================================
//  REGISTER PAGE — Show/hide role-specific fields
// ============================================================
export function showFields(role, clickedBtn) {
    // Save selected role so the form submit can read it
    localStorage.setItem("selectedRole", role)

    document.getElementById("reg-form").classList.remove("hidden")
    document.getElementById("fields-student").classList.add("hidden")
    document.getElementById("fields-supervisor").classList.add("hidden")

    if (role === "student")    document.getElementById("fields-student").classList.remove("hidden")
    if (role === "supervisor") document.getElementById("fields-supervisor").classList.remove("hidden")

    // Highlight active role button
    document.querySelectorAll(".role-group .btn-role").forEach(btn => btn.classList.remove("active"))
    if (clickedBtn) clickedBtn.classList.add("active")
}


// ============================================================
//  MANAGER DASHBOARD — Inventory chart data
// ============================================================
export async function renderManagerStockLevels() {
    const tabsContainer = document.getElementById('category-tabs')
    const tableContainer = document.getElementById('stock-table-container')
    if (!tabsContainer || !tableContainer) return

    const { data: cats } = await supabase.from('categories').select('id, name').order('name')
    const { data: components } = await supabase
        .from('components')
        .select('name, qty, categories(name)')
        .order('name')

    if (!cats || !components) return

    let activeCat = cats[0]?.name || ''

    function renderTable(catName) {
        activeCat = catName
        const filtered = components.filter(c => c.categories?.name === catName)

        // Update tab styles
        tabsContainer.querySelectorAll('button').forEach(btn => {
            btn.style.background = btn.dataset.cat === catName ? 'var(--main-blue)' : 'white'
            btn.style.color = btn.dataset.cat === catName ? 'white' : 'var(--main-blue)'
        })

        if (filtered.length === 0) {
            tableContainer.innerHTML = `<p style="color:#999; text-align:center; padding:20px;">No components in this category.</p>`
            return
        }

        tableContainer.innerHTML = `
            <table style="width:100%; border-collapse:collapse;">
                <thead>
                    <tr>
                        <th style="text-align:left; padding:10px; background:#f8f9fa; color:#555; font-size:0.85rem; border-bottom:2px solid #eee;">Component</th>
                        <th style="text-align:left; padding:10px; background:#f8f9fa; color:#555; font-size:0.85rem; border-bottom:2px solid #eee;">Stock</th>
                        <th style="text-align:left; padding:10px; background:#f8f9fa; color:#555; font-size:0.85rem; border-bottom:2px solid #eee;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtered.map(c => `
                        <tr>
                            <td style="padding:10px; border-bottom:1px solid #f1f1f1;">${c.name}</td>
                            <td style="padding:10px; border-bottom:1px solid #f1f1f1; font-weight:600; color:${c.qty > 0 ? 'green' : 'red'}">${c.qty}</td>
                            <td style="padding:10px; border-bottom:1px solid #f1f1f1;">
                                <span style="padding:3px 10px; border-radius:20px; font-size:0.75rem; font-weight:600; background:${c.qty > 10 ? '#d4edda' : c.qty > 0 ? '#fff3cd' : '#f8d7da'}; color:${c.qty > 10 ? '#155724' : c.qty > 0 ? '#856404' : '#721c24'};">
                                    ${c.qty > 10 ? 'OK' : c.qty > 0 ? 'LOW' : 'OUT'}
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `
    }

    // Build category tabs
    tabsContainer.innerHTML = ''
    cats.forEach(cat => {
        const btn = document.createElement('button')
        btn.textContent = cat.name
        btn.dataset.cat = cat.name
        btn.style = `padding:6px 14px; border-radius:20px; border:1px solid var(--main-blue); background:white; color:var(--main-blue); cursor:pointer; font-size:0.85rem;`
        btn.onclick = () => renderTable(cat.name)
        tabsContainer.appendChild(btn)
    })

    // Render first category by default
    renderTable(activeCat)
}


// ============================================================
//  BOOT — Runs on every page load
// ============================================================
window.addEventListener('DOMContentLoaded', async () => {
    // Make key functions globally accessible from HTML onclick attributes
    window.toggleSidebar             = toggleSidebar
    window.toggleStoreGlobal         = toggleStoreGlobal
    window.logout                    = logout
    window.toggleProfileDropdown     = toggleProfileDropdown
    window.filterCatalog             = filterCatalog
    window.filterSidebarCategories   = filterSidebarCategories
    window.addItemToList             = addItemToList
    window.updateComponent           = updateComponent
    window.deleteComponent           = deleteComponent
    window.addNewComponent           = addNewComponent
    window.showFields                = showFields
    window.handleDecision            = handleDecision
    window.loadProposalDetails       = loadProposalDetails
    window.openProposal              = openProposal
    window.sendToESP32               = sendToESP32
    window.markCollected             = markCollected
    window.finalizePacking           = finalizePacking
    window.assignDrawer              = assignDrawer
    window.highlightAllDrawers       = highlightAllDrawers
    window.closeModal                = closeModal
    window.findNow                   = findNow
    window.editComponent             = editComponent
    window.renderManagerStockLevels = renderManagerStockLevels
    // 0. Session validity check — runs on every page load
    // If the user was deleted from Supabase, force logout immediately
    const { data: { user: activeUser } } = await supabase.auth.getUser()
    if (activeUser) {
        const { data: activeProfile, error: sessionError } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', activeUser.id)
            .single()

        if (sessionError || !activeProfile) {
            // User exists in auth session but not in profiles — account was deleted
            await supabase.auth.signOut()
            localStorage.clear()
            alert('Your account has been removed. Please contact admin.')
            window.location.href = 'login.html'
            return
        }
    }

    // 1. Global on every page
    await initializeGlobalBanner()
    await renderGlobalNavigation()

    // 2. Page-specific
    if (document.getElementById('catalog-grid'))         await renderCatalog()
    if (document.getElementById('component-selector'))   await populateDropdown()
    if (document.getElementById('welcome-msg'))          await renderStudentDashboard()
    if (document.getElementById('pending-list-container')) await renderSupervisorDashboard()
    if (document.getElementById('master-student-list'))  await renderMasterStudentList()
    if (document.getElementById('status-container'))     await renderStatus()
    if (document.getElementById('approved-proposals-body')) await renderDispenseTables()
    if (document.getElementById('history-proposal-body'))   await renderEnhancedHistory()

    // Login form
    const loginForm = document.getElementById('login-form')
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault()
            const email    = document.getElementById('login-email').value
            const password = document.getElementById('login-password').value
            await handleLogin(email, password)
        })
    }

    // Registration form
    const regForm = document.getElementById('reg-form')
    if (regForm) {
        regForm.addEventListener('submit', async (e) => {
            e.preventDefault()
            const fullName      = document.querySelector('[placeholder="Full Name"]').value
            const email         = document.querySelector('[placeholder="Email"]').value
            const password      = document.querySelector('[placeholder="Password"]').value
            const role          = localStorage.getItem('selectedRole') || 'student'
            const matricNumber   = document.querySelector('[placeholder="Student Matrik Number"]')?.value
            const supervisorCode = role === 'student'
                ? document.querySelector('[placeholder="Supervisor Auth Code (Ask your supervisor)"]')?.value
                : document.querySelector('[placeholder="Create Your Exclusive Auth Code (Share this with your students)"]')?.value
            await handleRegister(fullName, email, password, role, matricNumber, supervisorCode)
        })
    }

    // Submission form
    const subForm = document.getElementById('submission-form')
    if (subForm) {
        subForm.addEventListener('submit', submitProposal)
    }

    // Manager dashboard chart
    if (document.getElementById('category-tabs')) {
        await renderManagerStockLevels()

        // Load pending packing count
        const { data: pendingData } = await supabase
            .from('proposals')
            .select('id')
            .eq('supervisor_status', 'Approved')
            .eq('store_status', 'Waiting')
        const pendingEl = document.getElementById('pending-packing-count')
        if (pendingEl) pendingEl.innerText = (pendingData || []).length

        // Load fulfilled dispense count
        const { data: fulfilledData } = await supabase
            .from('proposals')
            .select('id')
            .in('store_status', ['Done', 'Collected'])
        const fulfilledEl = document.getElementById('fulfilled-count')
        if (fulfilledEl) fulfilledEl.innerText = (fulfilledData || []).length
    }
})