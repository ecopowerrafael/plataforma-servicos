import { NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { IconChevronRight } from '@tabler/icons-react';

export interface NavItem {
  label: string;
  to: string;
  icon?: string;
  items?: NavItem[];
}

export interface NavGroup {
  label: string;
  path: string;
  items: NavItem[];
}

interface AppSidebarProps {
  tenantName: string;
  groups: NavGroup[];
  isCollapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
}

export function AppSidebar({
  tenantName,
  groups,
  isCollapsed = false,
  onCollapse,
}: AppSidebarProps) {
  const location = useLocation();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (path: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  const isGroupActive = (groupPath: string) => {
    return location.pathname.startsWith(groupPath);
  };

  return (
    <aside className={`app-sidebar${isCollapsed ? ' is-collapsed' : ''}`}>
      <div className="app-sidebar-brand">
        <strong>{tenantName}</strong>
      </div>

      <nav className="app-sidebar-nav">
        <NavLink to="/app" end className="nav-item nav-home">
          <span className="nav-icon">⌂</span>
          <span className="nav-label">Início</span>
        </NavLink>

        {groups.map((group) => (
          <div key={group.path} className="nav-group">
            <button
              className={`nav-group-header ${isGroupActive(group.path) ? 'active' : ''}`}
              onClick={() => toggleGroup(group.path)}
              aria-expanded={expandedGroups[group.path] ?? isGroupActive(group.path)}
            >
              <span className="nav-label">{group.label}</span>
              <IconChevronRight
                size={16}
                className="nav-chevron"
                style={{
                  transform: expandedGroups[group.path] ?? isGroupActive(group.path)
                    ? 'rotate(90deg)'
                    : 'rotate(0deg)',
                }}
              />
            </button>

            {(expandedGroups[group.path] ?? isGroupActive(group.path)) && (
              <div className="nav-group-items">
                {group.items.map((item) => {
                  const hasSubitems = item.items && item.items.length > 0;
                  const itemKey = `${group.path}/${item.to}`;

                  if (hasSubitems) {
                    return (
                      <details
                        key={item.to}
                        open={
                          expandedGroups[itemKey] ?? location.pathname.startsWith(item.to)
                        }
                        onToggle={(e) => {
                          const open = e.currentTarget.open;
                          setExpandedGroups((prev) => ({ ...prev, [itemKey]: open }));
                        }}
                      >
                        <summary className="nav-item nav-submenu-header">
                          {item.icon && <span className="nav-icon">{item.icon}</span>}
                          <span className="nav-label">{item.label}</span>
                        </summary>
                        <div className="nav-submenu">
                          {item.items!.map((subitem) => (
                            <NavLink
                              key={subitem.to}
                              to={subitem.to}
                              end
                              className="nav-item nav-subitem"
                            >
                              <span className="nav-label">{subitem.label}</span>
                            </NavLink>
                          ))}
                        </div>
                      </details>
                    );
                  }

                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className="nav-item"
                    >
                      {item.icon && <span className="nav-icon">{item.icon}</span>}
                      <span className="nav-label">{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}
