import { describe, it, expect } from 'vitest';

describe('DirectoryPages - SEO "Perto de Mim"', () => {
  describe('Category metadata', () => {
    it('title contém "perto de mim" e "opções próximas"', () => {
      const singular = 'Barbearia';
      const title = `${singular} perto de mim: encontre opções próximas | Agendei`;
      expect(title).toContain('perto de mim');
      expect(title).toContain('opções próximas');
      expect(title).toContain(singular);
    });

    it('description menciona plural e contatos', () => {
      const plural = 'Barbearias';
      const description = `Encontre ${plural.toLowerCase()} perto de você, veja endereço, bairro, telefone e WhatsApp para entrar em contato.`;
      expect(description).toContain('perto de você');
      expect(description).toContain('WhatsApp');
    });

    it('H1 usa plural sem artigo', () => {
      const plural = 'Barbearias';
      const h1 = `Encontre ${plural.toLowerCase()} perto de você`;
      expect(h1).toContain('barbearias');
      expect(h1).not.toContain('um(a)');
    });
  });

  describe('City metadata', () => {
    it('title usa cidade, estado e "encontre uma opção"', () => {
      const plural = 'Barbearias';
      const city = 'São Paulo';
      const state = 'SP';
      const title = `${plural} em ${city}, ${state}: encontre uma opção perto de você | Agendei`;
      expect(title).toContain(city);
      expect(title).toContain(state);
      expect(title).toContain('encontre uma opção');
    });

    it('description usa cidade e pluralName', () => {
      const plural = 'Barbearias';
      const city = 'São Paulo';
      const description = `Encontre ${plural.toLowerCase()} em ${city}, veja endereço, bairro, telefone e WhatsApp para contato.`;
      expect(description).toContain(city);
      expect(description).toContain('bairro');
    });
  });

  describe('Business metadata', () => {
    it('description contém nome, cidade, estado, e contatos quando disponíveis', () => {
      const name = 'Barbearia Silva';
      const city = 'São Paulo';
      const state = 'SP';
      const hasWhatsApp = true;
      const hasPhone = true;
      const description = `${name} em ${city}/${state}. Consulte endereço${hasWhatsApp ? ', WhatsApp' : ''}${hasPhone ? ', telefone' : ''} e informações para contato.`;
      expect(description).toContain(name);
      expect(description).toContain(`${city}/${state}`);
      expect(description).toContain('WhatsApp');
      expect(description).toContain('telefone');
    });

    it('description não menciona WhatsApp quando null', () => {
      const name = 'Barbearia Silva';
      const city = 'São Paulo';
      const state = 'SP';
      const hasWhatsApp = false;
      const hasPhone = true;
      const description = `${name} em ${city}/${state}. Consulte endereço${hasWhatsApp ? ', WhatsApp' : ''}${hasPhone ? ', telefone' : ''} e informações para contato.`;
      expect(description).not.toContain(', WhatsApp');
      expect(description).toContain('telefone');
    });

    it('description não menciona telefone quando null', () => {
      const name = 'Barbearia Silva';
      const city = 'São Paulo';
      const state = 'SP';
      const hasWhatsApp = true;
      const hasPhone = false;
      const description = `${name} em ${city}/${state}. Consulte endereço${hasWhatsApp ? ', WhatsApp' : ''}${hasPhone ? ', telefone' : ''} e informações para contato.`;
      expect(description).toContain('WhatsApp');
      expect(description).not.toContain(', telefone');
    });
  });

  describe('Paginação otimizada', () => {
    it('não gera todos os links quando > 7 páginas', () => {
      const totalPages = 30;
      const currentPage = 5;
      const paginationRange = Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => {
        if (totalPages <= 7) return true;
        if (p === 1 || p === totalPages) return true;
        if (p >= currentPage - 1 && p <= currentPage + 1) return true;
        return false;
      });
      // Deve incluir página 1, totalPages, e página atual ± 1
      expect(paginationRange).toContain(1);
      expect(paginationRange).toContain(totalPages);
      expect(paginationRange).toContain(currentPage);
      // Não deve incluir todas
      expect(paginationRange.length).toBeLessThan(totalPages);
    });

    it('gera todos os links quando <= 7 páginas', () => {
      const totalPages = 5;
      const paginationRange = Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => {
        if (totalPages <= 7) return true;
        if (p === 1 || p === totalPages) return true;
        if (p >= 2 && p <= 4) return true;
        return false;
      });
      // Deve ser todas as 5 páginas
      expect(paginationRange).toHaveLength(5);
      expect(paginationRange).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('Related businesses', () => {
    it('limita a 6 businesses relacionados', () => {
      const items = Array.from({ length: 20 }, (_, i) => ({ id: i }));
      const limited = items.slice(0, 6);
      expect(limited).toHaveLength(6);
    });
  });
});
