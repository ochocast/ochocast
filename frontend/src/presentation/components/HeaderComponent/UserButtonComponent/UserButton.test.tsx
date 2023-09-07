import React from 'react';
import ReactDOM from 'react-dom';
import HeaderUserButton from './UserButton';

it('It should mount', () => {
  const div = document.createElement('div');
  ReactDOM.render(<HeaderUserButton />, div);
  ReactDOM.unmountComponentAtNode(div);
});
