export function createCheckbox(checked: boolean, animate = false): SVGSVGElement {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.classList.add('checkbox-svg');

    if (checked) {
        const circle = document.createElementNS(NS, 'circle');
        circle.setAttribute('cx', '8');
        circle.setAttribute('cy', '8');
        circle.setAttribute('r', '7');
        circle.setAttribute('fill', 'var(--vscode-button-background)');
        circle.setAttribute('stroke', 'none');
        if (animate) circle.classList.add('cb-fill-animate');
        svg.appendChild(circle);

        const poly = document.createElementNS(NS, 'polyline');
        poly.setAttribute('points', '4.5,8.5 7,11 11.5,5.5');
        poly.setAttribute('fill', 'none');
        poly.setAttribute('stroke', 'var(--vscode-button-foreground)');
        poly.setAttribute('stroke-width', '1.5');
        poly.setAttribute('stroke-linecap', 'round');
        poly.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(poly);
    } else {
        const circle = document.createElementNS(NS, 'circle');
        circle.setAttribute('cx', '8');
        circle.setAttribute('cy', '8');
        circle.setAttribute('r', '7');
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', 'var(--vscode-foreground)');
        circle.setAttribute('stroke-opacity', '0.4');
        circle.setAttribute('stroke-width', '1.2');
        svg.appendChild(circle);
    }

    return svg;
}
