// ==UserScript==
// @name         Diigo Smart Non-Blocking (Tab-Aware)
// @match        https://www.diigo.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    
    let processQueue = [];
    let isProcessing = false;
    let totalLinks = 0;
    let processedLinks = 0;
    let allLinksList = [];
    let isCompleted = false;
    let completedUrls = new Set();
    let skippedDuplicates = 0;
    let isTabActive = true; // Track tab activity
    let processingTimeout = null;
    
    // Progress div
    let progressDiv = null;
    let statusPanel = null;
    
    // Detect tab visibility change
    document.addEventListener('visibilitychange', () => {
        isTabActive = !document.hidden;
        if (isTabActive) {
            console.log('🔄 Tab is active again, continuing...');
            updateProgress();
        } else {
            console.log('⏸️ Tab is inactive, processing may be slower...');
        }
    });
    
    function createProgressDiv() {
        if (progressDiv) return;
        
        progressDiv = document.createElement('div');
        progressDiv.style.cssText = `
            position: fixed;
            bottom: 80px;
            right: 20px;
            background: #333;
            color: white;
            padding: 10px 15px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 14px;
            z-index: 99999;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            display: none;
        `;
        document.body.appendChild(progressDiv);
    }
    
    function createStatusPanel() {
        if (statusPanel) return;
        
        statusPanel = document.createElement('div');
        statusPanel.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 420px;
            max-height: 500px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            z-index: 99999;
            font-family: Arial, sans-serif;
            font-size: 12px;
            overflow: hidden;
            display: none;
            border: 1px solid #ddd;
        `;
        
        statusPanel.innerHTML = `
            <div style="background: #2196F3; color: white; padding: 10px; font-weight: bold; display: flex; justify-content: space-between;">
                <span>📋 Link Queue Status</span>
                <button id="closeStatusPanel" style="background: none; border: none; color: white; cursor: pointer; font-size: 16px;">✕</button>
            </div>
            <div id="linksList" style="max-height: 450px; overflow-y: auto; padding: 10px;">
                <div style="text-align: center; color: #999; padding: 20px;">No links added yet</div>
            </div>
        `;
        
        document.body.appendChild(statusPanel);
        
        document.getElementById('closeStatusPanel').onclick = () => {
            statusPanel.style.display = 'none';
        };
    }
    
    function updateStatusPanel() {
        if (!statusPanel) createStatusPanel();
        
        if (allLinksList.length === 0) {
            statusPanel.style.display = 'none';
            return;
        }
        
        statusPanel.style.display = 'block';
        
        const linksContainer = document.getElementById('linksList');
        if (!linksContainer) return;
        
        let html = '';
        let completedCount = 0;
        let processingCount = 0;
        let pendingCount = 0;
        
        const uniqueLinks = [];
        const seenUrls = new Set();
        
        for (let i = allLinksList.length - 1; i >= 0; i--) {
            const link = allLinksList[i];
            if (!seenUrls.has(link.url)) {
                seenUrls.add(link.url);
                uniqueLinks.unshift(link);
            }
        }
        
        for (let i = 0; i < uniqueLinks.length; i++) {
            const link = uniqueLinks[i];
            let status = '';
            let color = '';
            let icon = '';
            let bgColor = '';
            
            if (link.status === 'pending') {
                status = 'Pending';
                color = '#999';
                icon = '⏳';
                bgColor = '#f9f9f9';
                pendingCount++;
            } else if (link.status === 'processing') {
                status = 'Processing';
                color = '#4CAF50';
                icon = '🟢';
                bgColor = '#e8f5e9';
                processingCount++;
            } else if (link.status === 'completed') {
                status = 'Completed';
                color = '#27ae60';
                icon = '✅';
                bgColor = '#f0fff0';
                completedCount++;
            } else if (link.status === 'skipped') {
                status = 'Skipped (Duplicate)';
                color = '#f39c12';
                icon = '⏭️';
                bgColor = '#fff3e0';
            } else if (link.status === 'error') {
                status = 'Error';
                color = '#e74c3c';
                icon = '❌';
                bgColor = '#ffe8e8';
            }
            
            let displayUrl = link.url;
            if (displayUrl.length > 45) {
                displayUrl = displayUrl.substring(0, 42) + '...';
            }
            
            html += `
                <div style="padding: 8px; margin-bottom: 8px; border-left: 3px solid ${color}; background: ${bgColor}; border-radius: 4px;">
                    <div style="font-weight: bold; color: ${color}; display: flex; justify-content: space-between;">
                        <span>${icon} ${displayUrl}</span>
                        <span style="font-size: 10px;">#${i+1}</span>
                    </div>
                    <div style="font-size: 10px; color: #666; margin-top: 3px;">
                        ${status}
                    </div>
                </div>
            `;
        }
        
        const tabStatus = isTabActive ? '🟢 Active' : '⏸️ Inactive (Slower)';
        const summary = `
            <div style="padding: 8px; margin-bottom: 10px; background: #e3f2fd; border-radius: 4px; font-size: 11px;">
                📊 Summary: ✅ ${completedCount} Completed | 🟢 ${processingCount} Processing | ⏳ ${pendingCount} Pending | ⏭️ ${skippedDuplicates} Skipped<br>
                🖥️ Tab: ${tabStatus}
            </div>
        `;
        
        linksContainer.innerHTML = summary + html;
        linksContainer.scrollTop = linksContainer.scrollHeight;
    }
    
    function updateProgress() {
        if (!progressDiv) createProgressDiv();
        
        if (totalLinks === 0 || isCompleted) {
            if (isCompleted) {
                progressDiv.style.display = 'block';
                progressDiv.style.background = '#4CAF50';
                progressDiv.innerHTML = `🎉 COMPLETED! ${processedLinks}/${totalLinks} saved | ⏭️ ${skippedDuplicates} duplicates skipped 🎉`;
                setTimeout(() => {
                    progressDiv.style.display = 'none';
                }, 8000);
            } else {
                progressDiv.style.display = 'none';
            }
            return;
        }
        
        const remaining = totalLinks - processedLinks;
        
        if (processedLinks === totalLinks && totalLinks > 0) {
            isCompleted = true;
            progressDiv.style.display = 'block';
            progressDiv.style.background = '#4CAF50';
            progressDiv.innerHTML = `🎉 COMPLETE! ${processedLinks}/${totalLinks} saved | ⏭️ ${skippedDuplicates} skipped 🎉`;
            return;
        }
        
        progressDiv.style.display = 'block';
        progressDiv.style.background = '#2196F3';
        const currentLink = getCurrentProcessingLink();
        const tabIcon = isTabActive ? '' : ' ⏸️';
        progressDiv.innerHTML = `📊 Progress: ${processedLinks}/${totalLinks} saved | ⏳ ${remaining} remaining${tabIcon}<br>🟢 Now: ${currentLink}`;
    }
    
    function getCurrentProcessingLink() {
        const processing = allLinksList.find(l => l.status === 'processing');
        if (processing) {
            let url = processing.url;
            if (url.length > 35) url = url.substring(0, 32) + '...';
            return url;
        }
        return 'Waiting...';
    }
    
    function resetAll() {
        console.log('🔄 Resetting all data...');
        if (processingTimeout) {
            clearTimeout(processingTimeout);
            processingTimeout = null;
        }
        processQueue = [];
        isProcessing = false;
        totalLinks = 0;
        processedLinks = 0;
        allLinksList = [];
        isCompleted = false;
        completedUrls.clear();
        skippedDuplicates = 0;
        if (progressDiv) progressDiv.style.display = 'none';
        if (statusPanel) statusPanel.style.display = 'none';
    }
    
    function waitForElement(selector, timeout = 10000, interval = 200) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const checkElement = () => {
                const element = document.querySelector(selector);
                if (element) {
                    resolve(element);
                    return;
                }
                
                if (Date.now() - startTime >= timeout) {
                    reject(new Error(`Timeout waiting for: ${selector}`));
                    return;
                }
                
                // Use requestAnimationFrame for better performance
                setTimeout(checkElement, interval);
            };
            
            checkElement();
        });
    }
    
    async function openAddDialog() {
        const addBtn = document.querySelector('.add-type-item.link');
        if (addBtn) {
            addBtn.click();
            console.log('🔘 Opened Add dialog');
            await new Promise(resolve => setTimeout(resolve, 800));
            return true;
        }
        return false;
    }
    
    async function fillField(element, value, fieldType = 'input') {
        if (!element) return false;
        
        element.value = '';
        element.value = value;
        
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        
        if (fieldType === 'textarea') {
            element.dispatchEvent(new Event('keyup', { bubbles: true }));
        }
        
        element.focus();
        element.dispatchEvent(new Event('focus', { bubbles: true }));
        element.blur();
        element.dispatchEvent(new Event('blur', { bubbles: true }));
        
        console.log(`✅ Filled ${fieldType}: ${value.substring(0, 30)}`);
        return true;
    }
    
    async function processNext() {
        if (isCompleted) {
            console.log('🛑 Process already completed. Stopping...');
            return;
        }
        
        if (isProcessing) {
            console.log('⚠️ Already processing, skipping...');
            return;
        }
        
        if (processQueue.length === 0) {
            console.log('✅ Queue is empty! Stopping...');
            isProcessing = false;
            return;
        }
        
        if (processedLinks >= totalLinks && totalLinks > 0) {
            console.log('🛑 All links processed! Stopping...');
            isProcessing = false;
            isCompleted = true;
            updateProgress();
            return;
        }
        
        isProcessing = true;
        const currentLink = processQueue.shift();
        
        // SILENTLY skip if already completed
        if (completedUrls.has(currentLink)) {
            console.log(`⏭️ Silently skipping already saved link: ${currentLink}`);
            
            allLinksList.push({
                url: currentLink,
                status: 'skipped'
            });
            skippedDuplicates++;
            totalLinks = allLinksList.length;
            
            updateStatusPanel();
            updateProgress();
            
            isProcessing = false;
            setTimeout(() => processNext(), 500);
            return;
        }
        
        let linkItem = allLinksList.find(l => l.url === currentLink);
        if (!linkItem) {
            linkItem = { url: currentLink, status: 'processing' };
            allLinksList.push(linkItem);
            totalLinks = allLinksList.length;
        } else if (linkItem.status === 'completed') {
            console.log(`⏭️ Silently skipping completed link: ${currentLink}`);
            isProcessing = false;
            setTimeout(() => processNext(), 500);
            return;
        } else {
            linkItem.status = 'processing';
        }
        
        updateStatusPanel();
        updateProgress();
        
        console.log(`\n📋 Processing (${processQueue.length} remaining):`, currentLink.substring(0, 40));
        
        try {
            // Reduced timeouts for faster processing
            let urlInput = await waitForElement('.AddBookmark input[type="text"]', 5000).catch(() => null);
            
            if (!urlInput) {
                console.log('🔘 Dialog not open, opening now...');
                await openAddDialog();
                urlInput = await waitForElement('.AddBookmark input[type="text"]', 5000);
            }
            
            if (!urlInput) {
                throw new Error('Could not open Add dialog');
            }
            
            await fillField(urlInput, currentLink, 'input');
            await new Promise(resolve => setTimeout(resolve, 600));
            
            const nextBtn = await waitForElement('.submitButton', 4000);
            
            if (nextBtn && nextBtn.textContent.includes('Next')) {
                nextBtn.click();
                console.log('👉 Clicked Next button');
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                const descTextarea = await waitForElement('.AddBookmark textarea', 6000);
                
                if (descTextarea) {
                    await fillField(descTextarea, currentLink, 'textarea');
                    await new Promise(resolve => setTimeout(resolve, 800));
                    
                    const addBtn = await waitForElement('.submitButton', 4000);
                    
                    if (addBtn && addBtn.textContent.includes('Add')) {
                        addBtn.click();
                        processedLinks++;
                        completedUrls.add(currentLink);
                        
                        if (linkItem) {
                            linkItem.status = 'completed';
                        }
                        
                        updateStatusPanel();
                        updateProgress();
                        
                        console.log(`✅ SUCCESS (${processedLinks}/${totalLinks}) - Saved:`, currentLink.substring(0, 30));
                        await new Promise(resolve => setTimeout(resolve, 800));
                    } else {
                        console.warn('⚠️ Add button not found');
                        if (linkItem) linkItem.status = 'error';
                        updateStatusPanel();
                    }
                } else {
                    console.warn('⚠️ Description textarea not found');
                    if (linkItem) linkItem.status = 'error';
                    updateStatusPanel();
                }
            } else {
                console.warn('⚠️ Next button not found');
                if (linkItem) linkItem.status = 'error';
                updateStatusPanel();
            }
            
        } catch (error) {
            console.error('❌ Error processing link:', error.message);
            if (linkItem) linkItem.status = 'error';
            updateStatusPanel();
        }
        
        isProcessing = false;
        
        if (processedLinks + skippedDuplicates >= totalLinks && totalLinks > 0) {
            console.log(`\n🎉 ALL DONE! Saved: ${processedLinks} | Skipped: ${skippedDuplicates} | Total: ${totalLinks}`);
            isCompleted = true;
            updateProgress();
            return;
        }
        
        if (processQueue.length > 0 && processedLinks < totalLinks && !isCompleted) {
            // Slightly longer delay for background tab
            const delay = isTabActive ? 800 : 1200;
            console.log(`⏳ Waiting ${delay/1000} second before next link... (${processQueue.length} remaining)${!isTabActive ? ' [Tab inactive - slower]' : ''}`);
            setTimeout(() => {
                processNext();
            }, delay);
        }
    }
    
    function showBulkInput() {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            z-index: 999999;
            display: flex;
            justify-content: center;
            align-items: center;
        `;
        
        const box = document.createElement('div');
        box.style.cssText = `
            background: white;
            padding: 20px;
            border-radius: 10px;
            width: 500px;
            max-width: 90%;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `;
        
        box.innerHTML = `
            <h3 style="margin-top:0">📚 Bulk Add Links</h3>
            <p style="font-size:12px; color:#666;">Paste one link per line (https://...)</p>
            <textarea id="bulkLinks" style="width:100%; height:300px; padding:10px; border:1px solid #ccc; border-radius:5px; font-family:monospace;" placeholder="https://google.com
https://youtube.com
https://github.com"></textarea>
            <div style="margin-top:15px; display:flex; gap:10px; justify-content:flex-end;">
                <button id="cancelBulk" style="padding:8px 16px; background:#ccc; border:none; border-radius:5px; cursor:pointer;">Cancel</button>
                <button id="addBulk" style="padding:8px 16px; background:#4CAF50; color:white; border:none; border-radius:5px; cursor:pointer;">Add to Queue</button>
            </div>
        `;
        
        modal.appendChild(box);
        document.body.appendChild(modal);
        
        const textarea = box.querySelector('#bulkLinks');
        textarea.focus();
        
        box.querySelector('#cancelBulk').onclick = () => modal.remove();
        box.querySelector('#addBulk').onclick = () => {
            let links = textarea.value.split('\n')
                .map(l => l.trim())
                .filter(l => l && (l.startsWith('http') || l.startsWith('https')));
            
            if (links.length === 0) {
                alert('No valid links found!');
                return;
            }
            
            links = [...new Set(links)];
            
            console.log(`📥 Adding ${links.length} unique links to queue`);
            
            resetAll();
            
            totalLinks = links.length;
            processedLinks = 0;
            processQueue = [...links];
            allLinksList = [];
            isCompleted = false;
            completedUrls.clear();
            skippedDuplicates = 0;
            
            for (let link of links) {
                allLinksList.push({
                    url: link,
                    status: 'pending'
                });
            }
            
            modal.remove();
            isProcessing = false;
            
            createProgressDiv();
            createStatusPanel();
            updateStatusPanel();
            updateProgress();
            
            console.log(`🚀 Starting to process ${links.length} links...`);
            
            processNext();
        };
        
        modal.onkeydown = (e) => {
            if (e.key === 'Escape') modal.remove();
        };
    }
    
    // Click handler for single link
    document.addEventListener('click', async (e) => {
        const addButton = e.target.closest('.add-type-item.link');
        
        if (addButton) {
            e.preventDefault();
            e.stopPropagation();
            
            if (isCompleted) {
                resetAll();
            }
            
            console.log('🔘 Add link button clicked');
            
            let link = null;
            
            try {
                const clipboardText = await navigator.clipboard.readText();
                if (clipboardText && clipboardText.trim().startsWith('http')) {
                    link = clipboardText.trim();
                    console.log('📋 Got link from clipboard');
                }
            } catch (err) {
                console.log('Clipboard read failed');
            }
            
            if (!link) {
                link = prompt('📌 Enter URL to save:', 'https://');
                if (!link || !link.trim()) return;
                link = link.trim();
            }
            
            if (!link.startsWith('http')) {
                link = 'https://' + link;
            }
            
            if (completedUrls.has(link)) {
                console.log(`⏭️ Silently skipping already saved link: ${link}`);
                return;
            }
            
            const existingInQueue = allLinksList.find(l => l.url === link && (l.status === 'pending' || l.status === 'processing'));
            if (existingInQueue) {
                console.log(`⏭️ Silently skipping duplicate in queue: ${link}`);
                return;
            }
            
            allLinksList.push({
                url: link,
                status: 'pending'
            });
            processQueue.push(link);
            totalLinks = allLinksList.length;
            
            createProgressDiv();
            createStatusPanel();
            updateStatusPanel();
            updateProgress();
            
            if (!isProcessing && !isCompleted) {
                processNext();
            }
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'S') {
            e.preventDefault();
            
            if (isCompleted) resetAll();
            
            const currentUrl = window.location.href;
            
            if (completedUrls.has(currentUrl)) {
                console.log(`⏭️ Silently skipping already saved: ${currentUrl}`);
                return;
            }
            
            const existingInQueue = allLinksList.find(l => l.url === currentUrl && (l.status === 'pending' || l.status === 'processing'));
            if (existingInQueue) {
                console.log(`⏭️ Silently skipping duplicate: ${currentUrl}`);
                return;
            }
            
            allLinksList.push({
                url: currentUrl,
                status: 'pending'
            });
            processQueue.push(currentUrl);
            totalLinks = allLinksList.length;
            
            createProgressDiv();
            createStatusPanel();
            updateStatusPanel();
            updateProgress();
            
            if (!isProcessing && !isCompleted) {
                processNext();
            }
        }
        
        if (e.ctrlKey && e.shiftKey && e.key === 'B') {
            e.preventDefault();
            showBulkInput();
        }
    });
    
    const floatingBtn = document.createElement('div');
    floatingBtn.innerHTML = '📚 Bulk';
    floatingBtn.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 12px 20px;
        border-radius: 30px;
        cursor: pointer;
        z-index: 99999;
        font-family: Arial, sans-serif;
        font-size: 14px;
        font-weight: bold;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        transition: all 0.3s;
    `;
    floatingBtn.onmouseover = () => floatingBtn.style.transform = 'scale(1.05)';
    floatingBtn.onmouseout = () => floatingBtn.style.transform = 'scale(1)';
    floatingBtn.onclick = showBulkInput;
    document.body.appendChild(floatingBtn);
    
    createProgressDiv();
    createStatusPanel();
    
    console.log('✅ Diigo Queue System LOADED (Tab-Aware Version)');
    console.log('💡 Features:');
    console.log('   - 🚫 NO POPUPS - Silent duplicate handling');
    console.log('   - 🖥️ Tab-aware - Shows when tab is inactive');
    console.log('   - ⚡ Faster timeouts for better performance');
    console.log('   - ⏭️ Duplicates silently skipped');
    console.log('   - 🛑 Auto-stop when COMPLETED');
    console.log('   - 📊 Shows tab status in panel');
    console.log('   - 🔄 Fully automatic - no interruptions');
})();
